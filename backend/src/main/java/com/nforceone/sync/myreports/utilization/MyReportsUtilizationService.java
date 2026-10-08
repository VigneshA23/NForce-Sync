package com.nforceone.sync.myreports.utilization;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.myreports.utilization.UtilizationDtos.*;
import com.nforceone.sync.myreports.utilization.UtilizationMath.DayFacts;
import com.nforceone.sync.myreports.utilization.UtilizationMath.MemberAggregate;
import com.nforceone.sync.utilization.UtilSnapshot;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Backs the redesigned Team Utilization page (My Reporting Team). Strictly read-only.
 *
 * <p>Numbers deliberately match the Team Lead / PM / Executive dashboards: the numerator is approved
 * PRODUCTIVE hours (persisted snapshot when one exists, otherwise the APPROVED entry's productive
 * tasks — the same fallback {@code UtilizationService.resolveUtilizationPctForEmployees} uses). The
 * one intentional difference: the denominator uses the CONFIGURED standard hours per day from
 * Business Rules, whereas the persisted snapshots (and so the older pages) divide by a hardcoded 8.
 *
 * <p>Every endpoint does a fixed number of queries regardless of team size — never one per member.
 */
@Service
@Transactional(readOnly = true)
public class MyReportsUtilizationService {

    private static final long CONFIG_ID = 1L;
    private static final Set<EodEntry.Status> SUBMITTED_STATES = EnumSet.of(
            EodEntry.Status.SUBMITTED, EodEntry.Status.PARTIALLY_APPROVED, EodEntry.Status.APPROVED);
    private static final Set<EodEntry.Status> PENDING_STATES = EnumSet.of(
            EodEntry.Status.SUBMITTED, EodEntry.Status.PARTIALLY_APPROVED);
    /** How far back holidays are loaded so "previous working day" can cross into the prior month. */
    private static final int HOLIDAY_LOOKBACK_MONTHS = 2;

    private final AppUserRepository userRepository;
    private final EodEntryRepository entryRepository;
    private final UtilSnapshotRepository snapshotRepository;
    private final HolidayRepository holidayRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final UtilizationAccessPolicy accessPolicy;
    private final Clock clock;

    @Autowired
    public MyReportsUtilizationService(AppUserRepository userRepository,
                                       EodEntryRepository entryRepository,
                                       UtilSnapshotRepository snapshotRepository,
                                       HolidayRepository holidayRepository,
                                       BusinessRuleConfigRepository configRepository,
                                       UtilizationAccessPolicy accessPolicy) {
        this(userRepository, entryRepository, snapshotRepository, holidayRepository,
                configRepository, accessPolicy, Clock.systemDefaultZone());
    }

    MyReportsUtilizationService(AppUserRepository userRepository,
                                EodEntryRepository entryRepository,
                                UtilSnapshotRepository snapshotRepository,
                                HolidayRepository holidayRepository,
                                BusinessRuleConfigRepository configRepository,
                                UtilizationAccessPolicy accessPolicy,
                                Clock clock) {
        this.userRepository = userRepository;
        this.entryRepository = entryRepository;
        this.snapshotRepository = snapshotRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository = configRepository;
        this.accessPolicy = accessPolicy;
        this.clock = clock;
    }

    // ── summary ─────────────────────────────────────────────────────────────────────

    public UtilizationSummaryDto getSummary(String periodParam, String actingEmail) {
        UtilizationPeriodType type = UtilizationPeriodType.parse(periodParam);
        AppUser actor = accessPolicy.requireManager(actingEmail);
        LocalDate today = LocalDate.now(clock);
        BusinessRuleConfig config = requireConfig();
        Thresholds thresholds = thresholds(config);
        BigDecimal std = config.getWorkingHoursPerDay();

        Set<LocalDate> holidays = holidayDates(today.minusMonths(HOLIDAY_LOOKBACK_MONTHS), today);
        UtilizationPeriod period = UtilizationPeriod.resolve(type, today, holidays::contains);

        List<AppUser> members = activeMembers(accessPolicy.scopeMemberIds(actor));
        if (!period.hasCompletedDays()) {
            return new UtilizationSummaryDto(type.wire(), true, false, null, null, null, null,
                    thresholds, std, null, null, null,
                    new StatusCounts(0, 0, 0, 0), 0, members.size(), List.of());
        }

        List<Long> ids = members.stream().map(AppUser::getId).toList();
        LocalDate lo = period.hasPrevious() && period.previousFrom().isBefore(period.from())
                ? period.previousFrom() : period.from();
        Map<Long, Map<LocalDate, DayFacts>> facts = loadFacts(ids, lo, period.to(), holidays);

        List<MemberUtilizationDto> rows = new ArrayList<>();
        int optimal = 0, under = 0, over = 0, none = 0, excluded = 0;
        List<BigDecimal> currentPcts = new ArrayList<>();
        List<BigDecimal> previousPcts = new ArrayList<>();

        for (AppUser m : members) {
            Map<LocalDate, DayFacts> byDate = facts.getOrDefault(m.getId(), Map.of());
            MemberAggregate agg = UtilizationMath.aggregate(window(byDate, period.from(), period.to()), std);
            UtilizationStatus status = agg.status(thresholds.underPct(), thresholds.overPct());
            switch (status) {
                case OPTIMAL -> optimal++;
                case UNDER -> under++;
                case OVER -> over++;
                case NONE -> none++;
                case UNAVAILABLE -> excluded++;
            }
            currentPcts.add(agg.pct());
            rows.add(new MemberUtilizationDto(m.getId(), m.getFullName(), m.getEmployeeCode(), m.getEmail(),
                    status, agg.pct(), agg.hours(), agg.avgHoursPerDay(),
                    agg.availableDays(), agg.loggedDays(), agg.hasPendingApproval()));

            if (period.hasPrevious()) {
                previousPcts.add(UtilizationMath.aggregate(
                        window(byDate, period.previousFrom(), period.previousTo()), std).pct());
            }
        }
        rows.sort(Comparator.comparing(MemberUtilizationDto::fullName, String.CASE_INSENSITIVE_ORDER));

        BigDecimal average = UtilizationMath.average(currentPcts);
        BigDecimal previousAverage = period.hasPrevious() ? UtilizationMath.average(previousPcts) : null;
        BigDecimal delta = average != null && previousAverage != null ? average.subtract(previousAverage) : null;

        return new UtilizationSummaryDto(type.wire(), false, period.weekFallback(),
                period.from(), period.to(), period.previousFrom(), period.previousTo(),
                thresholds, std, average, previousAverage, delta,
                new StatusCounts(optimal, under, over, none), excluded, members.size(), rows);
    }

    // ── per-day values for the expanded row ─────────────────────────────────────────

    public UtilizationDaysDto getDays(Long employeeId, LocalDate from, LocalDate to, String actingEmail) {
        AppUser actor = accessPolicy.requireManager(actingEmail);
        accessPolicy.requireInScope(actor, employeeId);
        LocalDate today = LocalDate.now(clock);
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
        requireCurrentMonth(from, today);
        requireCurrentMonth(to, today);

        BusinessRuleConfig config = requireConfig();
        Thresholds thresholds = thresholds(config);
        BigDecimal std = config.getWorkingHoursPerDay();
        Set<LocalDate> holidays = holidayDates(from, to);
        Map<LocalDate, DayFacts> byDate = loadFacts(List.of(employeeId), from, to, holidays)
                .getOrDefault(employeeId, Map.of());

        List<UtilizationDayDto> days = new ArrayList<>();
        List<BigDecimal> elapsedPcts = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            DayFacts f = byDate.get(d);
            boolean weekend = isWeekend(d);
            boolean holiday = holidays.contains(d);
            boolean future = d.isAfter(today);
            boolean selectable = f.workingDay() && !future;
            MemberAggregate agg = UtilizationMath.aggregate(List.of(f), std);
            UtilizationStatus status = selectable
                    ? agg.status(thresholds.underPct(), thresholds.overPct()) : null;
            if (selectable && d.isBefore(today) && agg.pct() != null) elapsedPcts.add(agg.pct());
            days.add(new UtilizationDayDto(d, weekend, holiday, future, d.equals(today),
                    f.approvedLeave(), selectable, status,
                    selectable ? agg.pct() : null, agg.hours(),
                    agg.availableDays() > 0 && f.submitted(), f.workingDay() && f.pendingApproval()));
        }
        return new UtilizationDaysDto(employeeId, from, to, thresholds, std,
                UtilizationMath.average(elapsedPcts), days);
    }

    // ── entries for one date ────────────────────────────────────────────────────────

    public UtilizationEntriesDto getEntries(Long employeeId, LocalDate date, String actingEmail) {
        AppUser actor = accessPolicy.requireManager(actingEmail);
        accessPolicy.requireInScope(actor, employeeId);
        LocalDate today = LocalDate.now(clock);
        requireCurrentMonth(date, today);
        if (date.isAfter(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date must not be in the future");
        }
        AppUser employee = userRepository.findById(employeeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));

        BusinessRuleConfig config = requireConfig();
        Thresholds thresholds = thresholds(config);
        BigDecimal std = config.getWorkingHoursPerDay();
        Set<LocalDate> holidays = holidayDates(date, date);

        List<EodEntry> found = entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(
                List.of(employeeId), date, date);
        EodEntry entry = found.isEmpty() ? null : found.get(0);
        DayFacts f = loadFacts(List.of(employeeId), date, date, holidays).get(employeeId).get(date);
        MemberAggregate agg = UtilizationMath.aggregate(List.of(f), std);
        UtilizationStatus status = f.workingDay()
                ? agg.status(thresholds.underPct(), thresholds.overPct()) : null;

        // Drafts / rejected / missed entries are never exposed — same rule as the EOD Status page,
        // and they are not "submitted" for the purpose of the none status either.
        boolean showable = entry != null && SUBMITTED_STATES.contains(entry.getStatus());
        List<UtilizationEntryDto> entries = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        if (showable) {
            for (EodTask t : entry.getTasks()) {
                BigDecimal h = t.getHours() == null ? BigDecimal.ZERO : t.getHours();
                total = total.add(h);
                entries.add(new UtilizationEntryDto(
                        t.getId(),
                        t.getProject() != null ? t.getProject().getCode() : null,
                        t.getProject() != null ? t.getProject().getName() : null,
                        t.getTaskCategory() != null ? t.getTaskCategory().getName() : null,
                        t.getDescription(), h, isProductive(t)));
            }
            entries.sort(Comparator.comparing(UtilizationEntryDto::taskId,
                    Comparator.nullsLast(Comparator.naturalOrder())));
        }

        return new UtilizationEntriesDto(employeeId, employee.getFullName(), employee.getEmployeeCode(), date,
                isWeekend(date), holidays.contains(date), f.approvedLeave(),
                showable ? entry.getDayType().name() : null,
                showable ? entry.getStatus().name() : null,
                status, f.workingDay() ? agg.pct() : null, agg.hours(), total,
                agg.hasPendingApproval(), thresholds, std, entries);
    }

    // ── shared loading ──────────────────────────────────────────────────────────────

    /**
     * Per employee, per calendar day in [lo, hi]. Two queries (entries with tasks, snapshots) for the
     * whole set of employees, then pure in-memory resolution.
     */
    private Map<Long, Map<LocalDate, DayFacts>> loadFacts(List<Long> employeeIds, LocalDate lo, LocalDate hi,
                                                         Set<LocalDate> holidays) {
        Map<Long, Map<LocalDate, DayFacts>> out = new HashMap<>();
        if (employeeIds.isEmpty()) return out;

        Map<Long, Map<LocalDate, EodEntry>> entries = entryRepository
                .findWithTasksByEmployeeIdInAndEntryDateBetween(employeeIds, lo, hi).stream()
                .collect(Collectors.groupingBy(e -> e.getEmployee().getId(),
                        Collectors.toMap(EodEntry::getEntryDate, Function.identity(), (a, b) -> a)));
        Map<Long, Map<LocalDate, UtilSnapshot>> snapshots = snapshotRepository
                .findByEmployeeIdInAndSnapshotDateBetween(employeeIds, lo, hi).stream()
                .collect(Collectors.groupingBy(UtilSnapshot::getEmployeeId,
                        Collectors.toMap(UtilSnapshot::getSnapshotDate, Function.identity(), (a, b) -> a)));

        for (Long id : employeeIds) {
            Map<LocalDate, EodEntry> myEntries = entries.getOrDefault(id, Map.of());
            Map<LocalDate, UtilSnapshot> mySnaps = snapshots.getOrDefault(id, Map.of());
            Map<LocalDate, DayFacts> perDate = new HashMap<>();
            for (LocalDate d = lo; !d.isAfter(hi); d = d.plusDays(1)) {
                perDate.put(d, dayFacts(d, holidays, myEntries.get(d), mySnaps.get(d)));
            }
            out.put(id, perDate);
        }
        return out;
    }

    private static DayFacts dayFacts(LocalDate date, Set<LocalDate> holidays, EodEntry entry, UtilSnapshot snap) {
        boolean workingDay = !isWeekend(date) && !holidays.contains(date);
        EodEntry.Status st = entry == null ? null : entry.getStatus();
        boolean approvedLeave = entry != null
                && entry.getDayType() == EodEntry.DayType.LEAVE && st == EodEntry.Status.APPROVED;
        return new DayFacts(date, workingDay, approvedLeave,
                st != null && SUBMITTED_STATES.contains(st),
                st != null && PENDING_STATES.contains(st),
                approvedProductiveHours(entry, snap));
    }

    /** Snapshot when present, else the APPROVED entry's productive tasks — see class javadoc. */
    private static BigDecimal approvedProductiveHours(EodEntry entry, UtilSnapshot snap) {
        if (snap != null && snap.getApprovedProductiveHours() != null) return snap.getApprovedProductiveHours();
        if (entry == null || entry.getStatus() != EodEntry.Status.APPROVED) return BigDecimal.ZERO;
        BigDecimal sum = BigDecimal.ZERO;
        for (EodTask t : entry.getTasks()) {
            if (t.getHours() != null && isProductive(t)) sum = sum.add(t.getHours());
        }
        return sum;
    }

    private static boolean isProductive(EodTask t) {
        return t.getTaskCategory() != null && Boolean.TRUE.equals(t.getTaskCategory().getIsProductive());
    }

    private static List<DayFacts> window(Map<LocalDate, DayFacts> byDate, LocalDate from, LocalDate to) {
        List<DayFacts> out = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            DayFacts f = byDate.get(d);
            if (f != null) out.add(f);
        }
        return out;
    }

    private List<AppUser> activeMembers(List<Long> scopeIds) {
        if (scopeIds.isEmpty()) return List.of();
        return userRepository.findAllById(scopeIds).stream()
                .filter(u -> u.getStatus() == AppUser.Status.ACTIVE && u.getDeletedAt() == null)
                .toList();
    }

    private Set<LocalDate> holidayDates(LocalDate from, LocalDate to) {
        return holidayRepository.findByHolidayDateBetween(from, to).stream()
                .map(Holiday::getHolidayDate).collect(Collectors.toSet());
    }

    private BusinessRuleConfig requireConfig() {
        return configRepository.findById(CONFIG_ID).orElseThrow(() -> new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR, "Business rule configuration missing"));
    }

    private static Thresholds thresholds(BusinessRuleConfig c) {
        return new Thresholds(c.getUnderutilizedThresholdPct(), c.getOverloadedThresholdPct());
    }

    private static boolean isWeekend(LocalDate d) {
        DayOfWeek dow = d.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }

    /** Everything on this page is the current month only; anything else is a hand-edited URL. */
    private static void requireCurrentMonth(LocalDate date, LocalDate today) {
        if (!YearMonth.from(date).equals(YearMonth.from(today))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date must be within the current month");
        }
    }
}
