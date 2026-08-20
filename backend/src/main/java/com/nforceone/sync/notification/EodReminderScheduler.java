package com.nforceone.sync.notification;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.businessrules.ShiftSchedule;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.project.AllocationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

/**
 * Sends an EOD reminder once each shift's cutoff passes.
 *
 * <p>The deadline is per shift: {@code shift end + eod_cutoff_hours} (see
 * {@link ShiftSchedule#cutoffAt}). For Evening 15:30-00:30 with a 3h cutoff that is 03:30 the
 * morning after the work date, which is exactly the case a global time-of-day cutoff could not
 * express.
 *
 * <p>Reminders were manual before this (a PM/TL clicking "Remind" in a missing-EOD report) and
 * still are — this only adds the automatic pass. It reuses the same {@code EOD_REMINDER} type and
 * {@code /eod/submit} link so both look identical in the notification list.
 *
 * <p>Who gets reminded is the intersection of three tests: the role actually submits EODs
 * (EMPLOYEE or MANAGER), the person is on the shift whose cutoff just passed, and they hold a
 * project allocation covering that work date. Shift membership alone had been reminding every role
 * on the shift — a PM, and even a read-only Leadership viewer — to submit "your EOD".
 */
@Component
public class EodReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(EodReminderScheduler.class);

    private static final long BUSINESS_RULE_CONFIG_ID = 1L;

    /**
     * How far back a cutoff may have passed and still be reminded about. Wider than the 15-minute
     * tick so a restart or a slow tick still catches up, but far below the 24h between a shift's
     * consecutive cutoffs, so two work dates can never be confused for one another.
     */
    private static final Duration CATCH_UP = Duration.ofHours(2);

    /**
     * A shift's cutoff can land up to two days after the work date (a shift ending after midnight
     * plus a cutoff of up to 24h), so look back that far when deciding which work date a cutoff
     * that just passed belongs to.
     */
    private static final int WORK_DATE_LOOKBACK_DAYS = 2;

    /** An entry in one of these states is not a submission — the employee still owes an EOD. */
    private static final Set<EodEntry.Status> STILL_OWED = Set.of(
            EodEntry.Status.DRAFT, EodEntry.Status.REJECTED, EodEntry.Status.MISSED);

    /**
     * The only roles that submit an EOD. Everyone else — PM, DM, HR, FINANCE, LEADERSHIP,
     * SUPERADMIN — reviews or reports on EODs rather than filing one, so telling them "your EOD is
     * overdue" was always wrong, even when they held a shift and a project allocation.
     */
    private static final Set<AppUser.Role> SUBMITS_EOD = Set.of(
            AppUser.Role.EMPLOYEE, AppUser.Role.MANAGER);

    private final ShiftDefinitionRepository shiftRepository;
    private final AppUserRepository userRepository;
    private final EodEntryRepository entryRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final HolidayRepository holidayRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationService notificationService;
    private final AllocationRepository allocationRepository;

    public EodReminderScheduler(ShiftDefinitionRepository shiftRepository,
                                AppUserRepository userRepository,
                                EodEntryRepository entryRepository,
                                BusinessRuleConfigRepository configRepository,
                                HolidayRepository holidayRepository,
                                NotificationRepository notificationRepository,
                                NotificationService notificationService,
                                AllocationRepository allocationRepository) {
        this.shiftRepository = shiftRepository;
        this.userRepository = userRepository;
        this.entryRepository = entryRepository;
        this.configRepository = configRepository;
        this.holidayRepository = holidayRepository;
        this.notificationRepository = notificationRepository;
        this.notificationService = notificationService;
        this.allocationRepository = allocationRepository;
    }

    /**
     * Runs on the quarter hour, so a cutoff is acted on within 15 minutes of passing.
     *
     * <p>Times resolve in the JVM default zone, since shift times are stored zoneless and the
     * application sets no timezone. For a workforce outside the deployment host's zone the offset
     * would be wrong by the zone delta — there is no per-shift or per-user zone to correct with.
     */
    @Scheduled(cron = "0 */15 * * * *")
    @Transactional
    public void sendDueReminders() {
        LocalDateTime now = LocalDateTime.now();
        List<ShiftDefinition> shifts = shiftRepository.findAllByOrderByStartTimeAsc().stream()
                .filter(ShiftDefinition::isActive)
                .filter(s -> s.getEodCutoffHours() != null)
                .toList();
        if (shifts.isEmpty()) return;

        BusinessRuleConfig config = configRepository.findById(BUSINESS_RULE_CONFIG_ID).orElse(null);
        int sent = 0;

        for (ShiftDefinition shift : shifts) {
            for (int daysBack = 0; daysBack <= WORK_DATE_LOOKBACK_DAYS; daysBack++) {
                LocalDate workDate = now.toLocalDate().minusDays(daysBack);
                LocalDateTime cutoffAt = ShiftSchedule.cutoffAt(shift, workDate);
                if (cutoffAt == null) continue;

                // Only cutoffs that have passed, and only recently — an older one either already
                // triggered or is too stale to nag about now.
                if (cutoffAt.isAfter(now) || cutoffAt.isBefore(now.minus(CATCH_UP))) continue;

                // Nobody owes an EOD for a day they were not expected to work.
                if (isNonWorkingDay(workDate, config)) continue;

                sent += remindShift(shift, workDate, cutoffAt);
            }
        }

        if (sent > 0) {
            log.info("EOD cutoff reminders sent: {}", sent);
        }
    }

    private int remindShift(ShiftDefinition shift, LocalDate workDate, LocalDateTime cutoffAt) {
        // Holding a shift is not the same as owing an EOD. Shift membership alone reminded every
        // active account on the shift regardless of role — PMs, HR, even a read-only Leadership
        // viewer — to submit "your EOD". Only employees and team leads file one.
        List<AppUser> members = userRepository.findByShiftIdAndStatusAndDeletedAtIsNull(
                        shift.getId(), AppUser.Status.ACTIVE).stream()
                .filter(u -> SUBMITS_EOD.contains(u.getRole()))
                .toList();
        if (members.isEmpty()) return 0;

        // And of those, only the ones actually staffed on something that day. Project allocation is
        // the test the Missing EOD report already uses to decide who owes an EOD, so both features
        // agree rather than each carrying its own definition.
        Set<Long> allocated = allocationRepository.findEmployeeIdsAllocatedOn(
                members.stream().map(AppUser::getId).toList(), workDate);
        if (allocated.isEmpty()) return 0;

        OffsetDateTime cutoffInstant = cutoffAt.atZone(ZoneId.systemDefault()).toOffsetDateTime();
        int sent = 0;

        for (AppUser member : members) {
            if (!allocated.contains(member.getId())) continue;
            if (!owesEod(member.getId(), workDate)) continue;

            // Idempotency: anything of this type already delivered since the cutoff — including a
            // manual reminder from a manager — means this deadline is already covered.
            if (notificationRepository.existsByUserIdAndTypeAndCreatedAtAfter(
                    member.getId(), "EOD_REMINDER", cutoffInstant)) {
                continue;
            }

            // Shift names often already end in "Shift" (e.g. "Evening Shift"), so the name is used
            // bare rather than suffixed — "the Evening Shift cutoff", not "Evening Shift shift".
            notificationService.send(member.getId(), "EOD_REMINDER",
                    "EOD submission overdue",
                    "Your EOD for " + com.nforceone.sync.notification.NotificationDates.format(workDate) + " is past the " + shift.getName()
                            + " cutoff. Please submit it.",
                    "/eod/submit?date=" + workDate);
            sent++;
        }
        return sent;
    }

    /** No entry at all, or one still sitting unsubmitted. SUBMITTED/APPROVED need no reminder. */
    private boolean owesEod(Long employeeId, LocalDate workDate) {
        return entryRepository.findByEmployeeIdAndEntryDate(employeeId, workDate)
                .map(e -> STILL_OWED.contains(e.getStatus()))
                .orElse(true);
    }

    private boolean isNonWorkingDay(LocalDate date, BusinessRuleConfig config) {
        if (holidayRepository.findByHolidayDate(date).isPresent()) return true;

        DayOfWeek day = date.getDayOfWeek();
        if (day == DayOfWeek.SUNDAY) return true;
        // Saturday counts as a working day under the SUN_ONLY rule. Absent config falls back to
        // the seeded SAT_SUN rather than assuming everyone works Saturdays.
        BusinessRuleConfig.WeekendRule rule = config != null && config.getWeekendRule() != null
                ? config.getWeekendRule()
                : BusinessRuleConfig.WeekendRule.SAT_SUN;
        return day == DayOfWeek.SATURDAY && rule == BusinessRuleConfig.WeekendRule.SAT_SUN;
    }
}
