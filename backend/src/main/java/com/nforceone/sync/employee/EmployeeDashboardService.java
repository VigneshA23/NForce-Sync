package com.nforceone.sync.employee;

import com.nforceone.sync.approval.ApprovalAction;
import com.nforceone.sync.approval.ApprovalActionRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayDto;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.employee.dto.EmployeeDashboardStatsDto;
import com.nforceone.sync.employee.dto.EmployeeProjectDto;
import com.nforceone.sync.employee.dto.PendingCorrectionDto;
import com.nforceone.sync.employee.dto.TodayStatusDto;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class EmployeeDashboardService {

    private static final Set<EodEntry.Status> CORRECTION_STATUSES =
            Set.of(EodEntry.Status.REJECTED);

    private final AppUserRepository        userRepository;
    private final EodEntryRepository       entryRepository;
    private final ApprovalActionRepository actionRepository;
    private final AllocationRepository     allocationRepository;
    private final HolidayRepository        holidayRepository;
    private final BusinessRuleConfigRepository configRepository;

    private static final long BUSINESS_RULE_CONFIG_ID = 1L;

    public EmployeeDashboardService(AppUserRepository userRepository,
                                    EodEntryRepository entryRepository,
                                    ApprovalActionRepository actionRepository,
                                    AllocationRepository allocationRepository,
                                    HolidayRepository holidayRepository,
                                    BusinessRuleConfigRepository configRepository) {
        this.userRepository       = userRepository;
        this.entryRepository     = entryRepository;
        this.actionRepository    = actionRepository;
        this.allocationRepository = allocationRepository;
        this.holidayRepository   = holidayRepository;
        this.configRepository    = configRepository;
    }

    public EmployeeDashboardStatsDto getDashboardStats(Long employeeId, String actingEmail) {
        requireSelfOrSuperadmin(employeeId, actingEmail);

        LocalDate today = LocalDate.now();

        TodayStatusDto todayStatus = entryRepository
                .findByEmployeeIdAndEntryDate(employeeId, today)
                .map(e -> new TodayStatusDto(e.getStatus().name(), e.getSubmittedAt(), e.getRemarks()))
                .orElse(new TodayStatusDto("MISSING", null, null));

        List<EodEntry> recent = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(
                        employeeId, today.minusDays(30), today);

        List<EodEntry> corrections = recent.stream()
                .filter(e -> CORRECTION_STATUSES.contains(e.getStatus()))
                .toList();

        // One batch query for all corrections instead of one findByEodEntryId per entry (N+1) —
        // same fix EmployeeService already applies elsewhere; see
        // ApprovalActionRepository.findReviewerCommentsByEntryIds.
        java.util.Map<Long, String> reviewerCommentByEntryId = actionRepository
                .findReviewerCommentsByEntryIds(corrections.stream().map(EodEntry::getId).toList())
                .stream()
                .collect(Collectors.toMap(
                        a -> a.getEodEntry().getId(),
                        ApprovalAction::getComment,
                        (first, later) -> first));

        List<PendingCorrectionDto> pendingCorrections = corrections.stream()
                .map(e -> new PendingCorrectionDto(
                        e.getId(), e.getEntryDate(), e.getStatus().name(),
                        reviewerCommentByEntryId.get(e.getId()), e.getUpdatedAt()))
                .toList();

        LocalDate monthStart = today.withDayOfMonth(1);
        List<LocalDate> missedDates = computeMissedDates(employeeId, monthStart, today);

        return new EmployeeDashboardStatsDto(todayStatus, pendingCorrections, missedDates, missedDates.size());
    }

    public List<EmployeeProjectDto> getProjects(Long employeeId, String actingEmail) {
        requireSelfOrSuperadmin(employeeId, actingEmail);
        return allocationRepository.findByEmployeeId(employeeId).stream()
                .map(a -> new EmployeeProjectDto(
                        a.getProject().getId(),
                        a.getProject().getCode(),
                        a.getProject().getName(),
                        a.getProject().getPm() != null ? a.getProject().getPm().getFullName() : null,
                        a.getProject().getStatus().name(),
                        a.getEffectiveFrom(),
                        a.getEffectiveTo()))
                .toList();
    }

    public List<HolidayDto> getHolidaysForYear(int year) {
        return holidayRepository.findAllByOrderByHolidayDateAsc().stream()
                .filter(h -> h.getHolidayDate().getYear() == year)
                .map(HolidayDto::from)
                .toList();
    }

    // ── private helpers ─────────────────────────────────────────────

    // Working days with no eod_entry row at all for this employee, up to (not including)
    // today — there is no scheduled job that ever writes EodEntry.Status.MISSED, so this
    // has to be derived on read rather than queried directly.
    //
    // Company holidays are skipped exactly like weekends: nothing is owed on a day the company
    // is closed, so an employee must not have to submit an empty report just to clear a count.
    // Submitting on a holiday (or a weekend) stays fully available for anyone who does work —
    // this only decides what counts as MISSING, never what is allowed.
    //
    // Also skips any day the employee held no project allocation — same "project allocation is
    // the test for owing an EOD" rule the reminder scheduler and Missing EOD report use, and the
    // same rule EmployeeService's calendar heatmap applies for its MISSED vs EMPTY cells, so this
    // count agrees with what the calendar shows.
    //
    // A Draft that was saved but never submitted does NOT count as covered here — once its day
    // is in the past (guaranteed by the loop below, which never reaches today) a stale Draft is
    // the same outcome as no entry at all, matching EmployeeService's calendar heatmap.
    private List<LocalDate> computeMissedDates(Long employeeId, LocalDate monthStart, LocalDate today) {
        List<EodEntry> monthEntries = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(
                        employeeId, monthStart, today.minusDays(1));
        Set<LocalDate> coveredDates = monthEntries.stream()
                .filter(e -> e.getStatus() != EodEntry.Status.DRAFT)
                .map(EodEntry::getEntryDate)
                .collect(Collectors.toSet());

        Set<LocalDate> holidays = holidayRepository.findAllByOrderByHolidayDateAsc().stream()
                .map(h -> h.getHolidayDate())
                .collect(Collectors.toSet());

        List<Allocation> allocations = allocationRepository.findByEmployeeId(employeeId);

        List<LocalDate> missed = new ArrayList<>();
        for (LocalDate d = monthStart; d.isBefore(today); d = d.plusDays(1)) {
            if (isWeekend(d)) continue;
            if (holidays.contains(d)) continue;
            if (coveredDates.contains(d)) continue;
            if (!isAllocatedOn(allocations, d)) continue;
            missed.add(d);
        }
        return missed;
    }

    private boolean isAllocatedOn(List<Allocation> allocations, LocalDate date) {
        return allocations.stream().anyMatch(a ->
                !a.getEffectiveFrom().isAfter(date)
                        && (a.getEffectiveTo() == null || !a.getEffectiveTo().isBefore(date)));
    }

    /** Sunday is always off; Saturday only counts under the admin-configured SAT_SUN rule. */
    private boolean isWeekend(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SUNDAY) return true;
        if (dow != DayOfWeek.SATURDAY) return false;
        BusinessRuleConfig config = configRepository.findById(BUSINESS_RULE_CONFIG_ID).orElse(null);
        BusinessRuleConfig.WeekendRule rule = config != null && config.getWeekendRule() != null
                ? config.getWeekendRule()
                : BusinessRuleConfig.WeekendRule.SAT_SUN;
        return rule == BusinessRuleConfig.WeekendRule.SAT_SUN;
    }

    private void requireSelfOrSuperadmin(Long employeeId, String actingEmail) {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (actor.getRole() != AppUser.Role.SUPERADMIN && !actor.getId().equals(employeeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }
}
