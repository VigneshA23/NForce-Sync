package com.nforceone.sync.employee;

import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.employee.dto.DashboardSummaryDto;
import com.nforceone.sync.employee.dto.UtilizationDetailDto;
import com.nforceone.sync.utilization.UtilSnapshot;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import com.nforceone.sync.utilization.UtilizationService;
import com.nforceone.sync.utilization.dto.UtilSnapshotDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
// import java.time.OffsetDateTime;
// import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class EmployeeService {

    private final EodEntryRepository        entryRepository;
    private final UtilSnapshotRepository    snapshotRepository;
    private final BusinessRuleConfigRepository rulesRepository;
    private final UtilizationService        utilizationService;

    public EmployeeService(EodEntryRepository entryRepository,
                           UtilSnapshotRepository snapshotRepository,
                           BusinessRuleConfigRepository rulesRepository,
                           UtilizationService utilizationService) {
        this.entryRepository  = entryRepository;
        this.snapshotRepository = snapshotRepository;
        this.rulesRepository  = rulesRepository;
        this.utilizationService = utilizationService;
    }

    @Transactional(readOnly = true)
    public DashboardSummaryDto getDashboardSummary(Long employeeId, LocalDate calendarFrom, LocalDate calendarTo) {
        LocalDate today = LocalDate.now();
        LocalTime cutoffTime = getCutoffTime();

        // ── Cutoff status ──────────────────────────────────────────────────────
        DashboardSummaryDto.CutoffStatus cutoffStatus = buildCutoffStatus(employeeId, today, cutoffTime);

        // ── Quick stats: current Mon–today (or full week) ──────────────────────
        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        LocalDate monthStart = today.withDayOfMonth(1);

        // Week approved hours from snapshots Mon–today
        List<UtilSnapshotDto> weekSnaps = utilizationService.getForEmployee(employeeId, weekStart, today);
        BigDecimal weekApprovedHours = weekSnaps.stream()
                .map(UtilSnapshotDto::approvedProductiveHours)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Month avg util from snapshots (only days with available > 0)
        List<UtilSnapshotDto> monthSnaps = utilizationService.getForEmployee(employeeId, monthStart, today);
        BigDecimal monthAvgUtil = computeAvgUtil(monthSnaps);

        // Streak: consecutive approved weekdays going back from today
        int streak = computeStreak(employeeId, today);

        // Days since last issue (MISSED, REJECTED, CHANGES_REQUESTED)
        int daysSinceLastIssue = computeDaysSinceLastIssue(employeeId, today);

        DashboardSummaryDto.QuickStats quickStats = new DashboardSummaryDto.QuickStats(
                weekApprovedHours, monthAvgUtil, streak, daysSinceLastIssue);

        // ── Blocked tasks: from last 14 days' non-APPROVED entries still active ─
        List<DashboardSummaryDto.BlockedTask> blockedTasks = buildBlockedTasks(employeeId, today);

        // ── Recent entries: last 5 ─────────────────────────────────────────────
        List<DashboardSummaryDto.RecentEntry> recentEntries = buildRecentEntries(employeeId, today);

        // ── Calendar: full displayed month ─────────────────────────────────────
        List<DashboardSummaryDto.CalendarDay> calendarData = buildCalendarData(employeeId, calendarFrom, calendarTo);

        return new DashboardSummaryDto(cutoffStatus, quickStats, blockedTasks, recentEntries, calendarData);
    }

    @Transactional(readOnly = true)
    public UtilizationDetailDto getUtilizationDetail(Long employeeId, LocalDate from, LocalDate to) {
        // All snapshot data comes from UtilizationService — single source of truth
        List<UtilSnapshotDto> snaps = utilizationService.getForEmployee(employeeId, from, to);

        List<UtilizationDetailDto.WeekTrend> weeklyTrend = buildWeeklyTrend(snaps, from, to);

        // Current period aggregates
        UtilizationDetailDto.CurrentPeriod currentPeriod = buildCurrentPeriod(snaps, from, to);

        // Category breakdown (totals across entire range)
        UtilizationDetailDto.CategoryBreakdown breakdown = buildCategoryBreakdown(snaps);

        // History: one row per snapshot (ascending)
        List<UtilizationDetailDto.HistoryDay> history = snaps.stream()
                .map(s -> new UtilizationDetailDto.HistoryDay(
                        s.snapshotDate(),
                        s.availableHours(),
                        s.approvedProductiveHours(),
                        s.billableHours(),
                        s.nonBillableHours(),
                        s.benchHours(),
                        s.utilizationPct()
                )).toList();

        return new UtilizationDetailDto(weeklyTrend, currentPeriod, breakdown, history);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private LocalTime getCutoffTime() {
        return rulesRepository.findById(1L)
                .map(BusinessRuleConfig::getEodCutoffTime)
                .orElse(LocalTime.of(19, 0));
    }

    private DashboardSummaryDto.CutoffStatus buildCutoffStatus(Long employeeId, LocalDate today, LocalTime cutoffTime) {
        Optional<EodEntry> todayEntry = entryRepository.findByEmployeeIdAndEntryDate(employeeId, today);
        String status = todayEntry.map(e -> e.getStatus().name()).orElse(null);

        // Cutoff is server local time vs cutoff time from config
        LocalTime now = LocalTime.now();
        boolean cutoffPassed = now.isAfter(cutoffTime);

        return new DashboardSummaryDto.CutoffStatus(today, status, cutoffPassed, cutoffTime);
    }

    private int computeStreak(Long employeeId, LocalDate today) {
        int streak = 0;
        LocalDate cursor = isWeekend(today) ? previousWeekday(today) : today;
        for (int i = 0; i < 90; i++) {
            if (isWeekend(cursor)) {
                cursor = previousWeekday(cursor);
                continue;
            }
            Optional<EodEntry> entry = entryRepository.findByEmployeeIdAndEntryDate(employeeId, cursor);
            if (entry.isPresent() && entry.get().getStatus() == EodEntry.Status.APPROVED) {
                streak++;
                cursor = cursor.minusDays(1);
            } else {
                break;
            }
        }
        return streak;
    }

    private int computeDaysSinceLastIssue(Long employeeId, LocalDate today) {
        LocalDate lookback = today.minusDays(90);
        List<EodEntry> entries = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(employeeId, lookback, today);

        return entries.stream()
                .filter(e -> e.getStatus() == EodEntry.Status.MISSED
                          || e.getStatus() == EodEntry.Status.REJECTED
                          || e.getStatus() == EodEntry.Status.CHANGES_REQUESTED)
                .map(EodEntry::getEntryDate)
                .max(Comparator.naturalOrder())
                .map(issueDate -> (int) today.toEpochDay() - (int) issueDate.toEpochDay())
                .orElse(-1); // -1 = no issues found in 90-day window
    }

    private List<DashboardSummaryDto.BlockedTask> buildBlockedTasks(Long employeeId, LocalDate today) {
        LocalDate lookback = today.minusDays(14);
        List<EodEntry> recent = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(employeeId, lookback, today);

        List<DashboardSummaryDto.BlockedTask> blocked = new ArrayList<>();
        for (EodEntry entry : recent) {
            if (entry.getStatus() == EodEntry.Status.MISSED) continue;
            for (EodTask task : entry.getTasks()) {
                if (task.getTaskStatus() == EodTask.TaskStatus.BLOCKED) {
                    String projectName = task.getProject() != null ? task.getProject().getName() : "—";
                    blocked.add(new DashboardSummaryDto.BlockedTask(
                            entry.getId(),
                            entry.getEntryDate(),
                            projectName,
                            task.getDescription(),
                            task.getBlockerReason()
                    ));
                }
            }
        }
        return blocked;
    }

    private List<DashboardSummaryDto.RecentEntry> buildRecentEntries(Long employeeId, LocalDate today) {
        LocalDate lookback = today.minusDays(30);
        List<EodEntry> entries = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(employeeId, lookback, today);

        Map<LocalDate, UtilSnapshot> snapMap = snapshotRepository
                .findByEmployeeIdAndSnapshotDateBetweenOrderBySnapshotDateAsc(employeeId, lookback, today)
                .stream()
                .collect(Collectors.toMap(UtilSnapshot::getSnapshotDate, s -> s));

        return entries.stream()
                .limit(10)
                .map(e -> {
                    BigDecimal total = e.getTasks().stream()
                            .map(EodTask::getHours)
                            .filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    long blockedCount = e.getTasks().stream()
                            .filter(t -> t.getTaskStatus() == EodTask.TaskStatus.BLOCKED)
                            .count();
                    UtilSnapshot snap = snapMap.get(e.getEntryDate());
                    BigDecimal util = snap != null ? snap.getUtilizationPct() : null;
                    return new DashboardSummaryDto.RecentEntry(
                            e.getId(),
                            e.getEntryDate(),
                            e.getStatus().name(),
                            total,
                            (int) blockedCount,
                            util
                    );
                })
                .toList();
    }

    private List<DashboardSummaryDto.CalendarDay> buildCalendarData(Long employeeId, LocalDate gridStart, LocalDate gridEnd) {
        LocalDate realToday = LocalDate.now();

        List<EodEntry> entries = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(employeeId, gridStart, gridEnd);
        Map<LocalDate, String> statusMap = entries.stream()
                .collect(Collectors.toMap(EodEntry::getEntryDate, e -> e.getStatus().name()));

        List<UtilSnapshot> snaps = snapshotRepository
                .findByEmployeeIdAndSnapshotDateBetweenOrderBySnapshotDateAsc(employeeId, gridStart, gridEnd);
        // Built with an explicit loop, not Collectors.toMap: utilization_pct is nullable (it is
        // left null when available_hours is 0 — a weekend or holiday, where utilization is
        // undefined rather than zero) and toMap throws NullPointerException on a null VALUE.
        // A single such snapshot inside the displayed month would 500 the whole dashboard.
        Map<LocalDate, BigDecimal> utilMap = new HashMap<>();
        for (UtilSnapshot snap : snaps) {
            utilMap.put(snap.getSnapshotDate(), snap.getUtilizationPct());
        }

        List<DashboardSummaryDto.CalendarDay> days = new ArrayList<>();
        LocalDate cursor = gridStart;
        while (!cursor.isAfter(gridEnd)) {
            boolean weekend = isWeekend(cursor);
            boolean future  = cursor.isAfter(realToday);
            String status   = statusMap.get(cursor);
            if (weekend) status = "WEEKEND";
            else if (future) status = "FUTURE";
            else if (status == null) status = "EMPTY";
            BigDecimal util = utilMap.get(cursor);
            days.add(new DashboardSummaryDto.CalendarDay(cursor, status, util, weekend, future));
            cursor = cursor.plusDays(1);
        }
        return days;
    }

    private List<UtilizationDetailDto.WeekTrend> buildWeeklyTrend(
            List<UtilSnapshotDto> snaps, LocalDate from, LocalDate to) {

        // Group snapshots by ISO week (Monday–Sunday)
        Map<LocalDate, List<UtilSnapshotDto>> byWeek = new LinkedHashMap<>();
        for (UtilSnapshotDto snap : snaps) {
            LocalDate monday = snap.snapshotDate().with(DayOfWeek.MONDAY);
            byWeek.computeIfAbsent(monday, k -> new ArrayList<>()).add(snap);
        }

        // Ensure all weeks in range appear (even with no data)
        LocalDate weekCursor = from.with(DayOfWeek.MONDAY);
        while (!weekCursor.isAfter(to)) {
            byWeek.computeIfAbsent(weekCursor, k -> new ArrayList<>());
            weekCursor = weekCursor.plusWeeks(1);
        }

        return new ArrayList<>(byWeek.entrySet()).stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> {
                    LocalDate wStart  = entry.getKey();
                    LocalDate wEnd    = wStart.plusDays(4); // Mon–Fri
                    List<UtilSnapshotDto> wSnaps = entry.getValue();

                    BigDecimal totalApproved  = sum(wSnaps, UtilSnapshotDto::approvedProductiveHours);
                    BigDecimal totalAvailable = sum(wSnaps, UtilSnapshotDto::availableHours);
                    BigDecimal avgUtil        = computeAvgUtil(wSnaps);
                    int workingDays = countWeekdaysBetween(wStart, wEnd.isAfter(to) ? to : wEnd);
                    int approvedDays = wSnaps.size();

                    return new UtilizationDetailDto.WeekTrend(
                            wStart, wEnd, avgUtil, totalApproved, totalAvailable, workingDays, approvedDays);
                })
                .toList();
    }

    private UtilizationDetailDto.CurrentPeriod buildCurrentPeriod(
            List<UtilSnapshotDto> snaps, LocalDate from, LocalDate to) {

        BigDecimal totalApproved  = sum(snaps, UtilSnapshotDto::approvedProductiveHours);
        BigDecimal totalAvailable = sum(snaps, UtilSnapshotDto::availableHours);
        BigDecimal avgUtil        = computeAvgUtil(snaps);
        int workingDays = countWeekdaysBetween(from, to);
        int approvedDays = snaps.size();

        return new UtilizationDetailDto.CurrentPeriod(
                from, to, avgUtil, totalApproved, totalAvailable, workingDays, approvedDays);
    }

    private UtilizationDetailDto.CategoryBreakdown buildCategoryBreakdown(List<UtilSnapshotDto> snaps) {
        BigDecimal billable    = sum(snaps, UtilSnapshotDto::billableHours);
        BigDecimal nonBillable = sum(snaps, UtilSnapshotDto::nonBillableHours);
        BigDecimal bench       = sum(snaps, UtilSnapshotDto::benchHours);
        BigDecimal total       = sum(snaps, UtilSnapshotDto::approvedProductiveHours);
        return new UtilizationDetailDto.CategoryBreakdown(billable, nonBillable, bench, total);
    }

    // ── Pure helpers ──────────────────────────────────────────────────────────

    private BigDecimal computeAvgUtil(List<UtilSnapshotDto> snaps) {
        List<BigDecimal> pcts = snaps.stream()
                .map(UtilSnapshotDto::utilizationPct)
                .filter(Objects::nonNull)
                .toList();
        if (pcts.isEmpty()) return null;
        BigDecimal total = pcts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.divide(BigDecimal.valueOf(pcts.size()), 2, RoundingMode.HALF_UP);
    }

    private BigDecimal sum(List<UtilSnapshotDto> snaps, java.util.function.Function<UtilSnapshotDto, BigDecimal> field) {
        return snaps.stream()
                .map(field)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private boolean isWeekend(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }

    private LocalDate previousWeekday(LocalDate date) {
        LocalDate d = date.minusDays(1);
        while (isWeekend(d)) d = d.minusDays(1);
        return d;
    }

    private int countWeekdaysBetween(LocalDate from, LocalDate to) {
        int count = 0;
        LocalDate cursor = from;
        while (!cursor.isAfter(to)) {
            if (!isWeekend(cursor)) count++;
            cursor = cursor.plusDays(1);
        }
        return count;
    }
}
