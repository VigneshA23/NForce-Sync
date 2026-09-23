package com.nforceone.sync.employee;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.config.Futures;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.businessrules.ShiftSchedule;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.employee.dto.DashboardSummaryDto;
import com.nforceone.sync.employee.dto.UtilizationDetailDto;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.utilization.UtilSnapshot;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import com.nforceone.sync.utilization.UtilizationService;
import com.nforceone.sync.utilization.dto.UtilSnapshotDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
// import java.time.OffsetDateTime;
// import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

@Service
public class EmployeeService {

    private final EodEntryRepository        entryRepository;
    private final EodTaskRepository         taskRepository;
    private final UtilSnapshotRepository    snapshotRepository;
    private final UtilizationService        utilizationService;
    private final ShiftDefinitionRepository shiftRepository;
    private final HolidayRepository         holidayRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final AllocationRepository      allocationRepository;
    private final Executor                  dashboardQueryExecutor;

    private static final long BUSINESS_RULE_CONFIG_ID = 1L;

    public EmployeeService(EodEntryRepository entryRepository,
                           EodTaskRepository taskRepository,
                           UtilSnapshotRepository snapshotRepository,
                           UtilizationService utilizationService,
                           ShiftDefinitionRepository shiftRepository,
                           HolidayRepository holidayRepository,
                           BusinessRuleConfigRepository configRepository,
                           AllocationRepository allocationRepository,
                           Executor dashboardQueryExecutor) {
        this.entryRepository  = entryRepository;
        this.taskRepository   = taskRepository;
        this.snapshotRepository = snapshotRepository;
        this.utilizationService = utilizationService;
        this.shiftRepository  = shiftRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository = configRepository;
        this.allocationRepository = allocationRepository;
        this.dashboardQueryExecutor = dashboardQueryExecutor;
    }

    public DashboardSummaryDto getDashboardSummary(AppUser employee, LocalDate calendarFrom, LocalDate calendarTo) {
        Long employeeId = employee.getId();
        LocalDate today = LocalDate.now();

        LocalDate weekStart = today.with(DayOfWeek.MONDAY);
        LocalDate monthStart = today.withDayOfMonth(1);
        // Week and month ranges overlap (weekStart can fall before OR after monthStart,
        // depending on where in the month "today" is) — fetched as one covering range in a
        // single query instead of two separate round trips, then split in memory.
        LocalDate rangeStart = weekStart.isBefore(monthStart) ? weekStart : monthStart;
        LocalDate lookback30 = today.minusDays(30);

        // ── Fan every independent read out in parallel ──────────────────────────
        // None of the six reads below depends on another's result, but each is its own network
        // round trip to the remote DB (~0.3-1.5s measured), so running them one after another —
        // as this method used to — only ever adds their latencies together. Dispatched on
        // dashboardQueryExecutor (bounded, see AsyncQueryConfig) so wall-clock cost drops from
        // sum(latencies) to roughly max(latencies).
        CompletableFuture<DashboardSummaryDto.CutoffStatus> cutoffStatusF = CompletableFuture.supplyAsync(
                () -> buildCutoffStatus(employee, today), dashboardQueryExecutor);

        CompletableFuture<List<UtilSnapshotDto>> rangeSnapsF = CompletableFuture.supplyAsync(
                () -> utilizationService.getForEmployee(employeeId, rangeStart, today), dashboardQueryExecutor);

        // Streak and days-since-last-issue both only need entryDate+status over a trailing
        // lookback window, so they share ONE lightweight query (100 days covers both: streak
        // needs 100, the issue lookback needs 90 and is filtered out of the same map) instead of
        // each independently issuing its own full tasks/project/category-joined fetch.
        CompletableFuture<Map<LocalDate, EodEntry.Status>> statusByDateF = CompletableFuture.supplyAsync(
                () -> entryRepository
                        .findEntryDateAndStatusByEmployeeIdAndEntryDateBetween(
                                employeeId, today.minusDays(STREAK_LOOKBACK_DAYS), today)
                        .stream()
                        .collect(Collectors.toMap(EodEntryRepository.EntryDateStatusView::getEntryDate,
                                EodEntryRepository.EntryDateStatusView::getStatus, (a, b) -> a)),
                dashboardQueryExecutor);

        CompletableFuture<Map<LocalDate, UtilSnapshot>> last30SnapMapF = CompletableFuture.supplyAsync(
                () -> snapshotRepository
                        .findByEmployeeIdAndSnapshotDateBetweenOrderBySnapshotDateAsc(employeeId, lookback30, today)
                        .stream()
                        .collect(Collectors.toMap(UtilSnapshot::getSnapshotDate, s -> s)),
                dashboardQueryExecutor);

        CompletableFuture<List<DashboardSummaryDto.CalendarDay>> calendarDataF = CompletableFuture.supplyAsync(
                () -> buildCalendarData(employeeId, calendarFrom, calendarTo), dashboardQueryExecutor);

        // Blocked tasks (last 14 days) and recent entries (last 30) share this one entry fetch —
        // the 14-day window is always a subset of the 30-day one — instead of each running its
        // own separate, fully-redundant copy of the same query. Run on THIS thread (not fanned
        // out like the others above/below) rather than as a future: blockedTasksFrom later reads
        // task.getAcknowledgedBy()/getResolvedBy(), lazy relations the @EntityGraph on this query
        // doesn't cover, and once a worker thread's ad-hoc transaction closes those entities are
        // permanently detached — no thread could resolve them afterward, not even this one. The
        // futures above/below were already dispatched (they run concurrently on the executor
        // while this query runs here), so this still overlaps with them in wall-clock time.
        List<EodEntry> last30Days = entryRepository.findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(
                employeeId, lookback30, today);

        CompletableFuture.allOf(cutoffStatusF, rangeSnapsF, statusByDateF,
                last30SnapMapF, calendarDataF).join();

        DashboardSummaryDto.CutoffStatus cutoffStatus = Futures.join(cutoffStatusF);
        List<UtilSnapshotDto> rangeSnaps = Futures.join(rangeSnapsF);
        Map<LocalDate, EodEntry.Status> statusByDate = Futures.join(statusByDateF);
        Map<LocalDate, UtilSnapshot> last30SnapMap = Futures.join(last30SnapMapF);
        List<DashboardSummaryDto.CalendarDay> calendarData = Futures.join(calendarDataF);

        // ── Quick stats — pure in-memory from rangeSnaps/statusByDate above ─────
        BigDecimal weekApprovedHours = rangeSnaps.stream()
                .filter(s -> !s.snapshotDate().isBefore(weekStart))
                .map(UtilSnapshotDto::approvedProductiveHours)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<UtilSnapshotDto> monthSnaps = rangeSnaps.stream()
                .filter(s -> !s.snapshotDate().isBefore(monthStart))
                .toList();
        BigDecimal monthAvgUtil = computeAvgUtil(monthSnaps);
        int streak = computeStreak(statusByDate, today);
        int daysSinceLastIssue = computeDaysSinceLastIssue(statusByDate, today);
        DashboardSummaryDto.QuickStats quickStats = new DashboardSummaryDto.QuickStats(
                weekApprovedHours, monthAvgUtil, streak, daysSinceLastIssue);

        // ── Blocked tasks + recent entries — pure in-memory from last30Days/last30SnapMap ───
        List<DashboardSummaryDto.BlockedTask> blockedTasks =
                blockedTasksFrom(last30Days, today.minusDays(14));
        List<DashboardSummaryDto.RecentEntry> recentEntries = buildRecentEntries(last30Days, last30SnapMap);

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
                        s.benchHours(),
                        s.utilizationPct()
                )).toList();

        return new UtilizationDetailDto(weeklyTrend, currentPeriod, breakdown, history);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * The cutoff comes from the employee's own shift as "shift end + N hours" — the previous
     * global time-of-day needed a rollover flag to stay correct for shifts crossing midnight, and
     * still could not give two shifts different deadlines. See {@link ShiftSchedule#cutoffAt}.
     *
     * <p>No shift assigned, or a shift with no cutoff configured, means there is no deadline to
     * show: the banner is suppressed rather than a cutoff being invented.
     */
    private DashboardSummaryDto.CutoffStatus buildCutoffStatus(AppUser employee, LocalDate today) {
        Optional<EodEntry> todayEntry = entryRepository.findByEmployeeIdAndEntryDate(employee.getId(), today);
        String status = todayEntry.map(e -> e.getStatus().name()).orElse(null);

        ShiftDefinition shift = shiftFor(employee.getShiftId());
        LocalDateTime cutoffAt = shift == null ? null : ShiftSchedule.cutoffAt(shift, today);
        if (cutoffAt == null) {
            return new DashboardSummaryDto.CutoffStatus(today, status, false, null, false);
        }

        boolean cutoffPassed = LocalDateTime.now().isAfter(cutoffAt);
        // Still reported as time-of-day + "is it tomorrow", because that is what the banner
        // renders; the difference is that it is now derived from a real instant.
        return new DashboardSummaryDto.CutoffStatus(today, status, cutoffPassed,
                cutoffAt.toLocalTime(), cutoffAt.toLocalDate().isAfter(today));
    }

    /** The given shift id's definition, or null when the employee has none assigned.
     *  Takes the id directly — the caller already has the AppUser it came from, so re-querying
     *  it here would just repeat the exact lookup the controller (or getDashboardSummary) already
     *  did to authenticate/resolve this request. */
    private ShiftDefinition shiftFor(Long shiftId) {
        if (shiftId == null) return null;
        return shiftRepository.findById(shiftId).orElse(null);
    }

    // The loop below can walk up to 90 days backward (each iteration moves the cursor back by
    // exactly one calendar day, whether skipping a weekend or checking a weekday), so the shared
    // 100-day statusByDate map (see getDashboardSummary) covers the full walk with margin. This
    // was previously the dominant contributor to the Employee Dashboard's load time: a long
    // approved streak issued dozens of sequential single-row DB round trips inside the one
    // request that gates the dashboard's skeleton.
    private static final int STREAK_LOOKBACK_DAYS = 100;
    private static final int ISSUE_LOOKBACK_DAYS = 90;

    private int computeStreak(Map<LocalDate, EodEntry.Status> statusByDate, LocalDate today) {
        int streak = 0;
        LocalDate cursor = isWeekend(today) ? previousWeekday(today) : today;
        for (int i = 0; i < 90; i++) {
            if (isWeekend(cursor)) {
                cursor = previousWeekday(cursor);
                continue;
            }
            if (statusByDate.get(cursor) == EodEntry.Status.APPROVED) {
                streak++;
                cursor = cursor.minusDays(1);
            } else {
                break;
            }
        }
        return streak;
    }

    private int computeDaysSinceLastIssue(Map<LocalDate, EodEntry.Status> statusByDate, LocalDate today) {
        LocalDate lookback = today.minusDays(ISSUE_LOOKBACK_DAYS);
        return statusByDate.entrySet().stream()
                .filter(e -> !e.getKey().isBefore(lookback))
                .filter(e -> e.getValue() == EodEntry.Status.MISSED
                          || e.getValue() == EodEntry.Status.REJECTED)
                .map(Map.Entry::getKey)
                .max(Comparator.naturalOrder())
                .map(issueDate -> (int) today.toEpochDay() - (int) issueDate.toEpochDay())
                .orElse(-1); // -1 = no issues found in 90-day window
    }

    /** Fetches a single blocker by task id, regardless of age or current task status —
     *  unlike {@link #buildBlockedTasks}'s 14-day/BLOCKED-only dashboard window, this backs
     *  a notification's deep link, which must resolve even to an old or since-resolved blocker. */
    @Transactional(readOnly = true)
    public DashboardSummaryDto.BlockedTask getBlockedTask(Long taskId, Long employeeId) {
        EodTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));
        EodEntry entry = task.getEodEntry();
        if (!entry.getEmployee().getId().equals(employeeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
        String projectName = task.getProject() != null ? task.getProject().getName() : "—";
        String categoryName = task.getTaskCategory() != null ? task.getTaskCategory().getName() : null;
        return new DashboardSummaryDto.BlockedTask(
                task.getId(),
                entry.getId(),
                entry.getEntryDate(),
                projectName,
                categoryName,
                task.getDescription(),
                task.getBlockerReason(),
                task.getAcknowledgedAt() != null,
                task.getAcknowledgedAt(),
                task.getAcknowledgedBy() != null ? task.getAcknowledgedBy().getFullName() : null,
                task.getBlockerStatus(),
                task.getResolvedAt(),
                task.getResolvedBy() != null ? task.getResolvedBy().getFullName() : null
        );
    }

    /** Full blocker history for the "My Blockers" page — unlike the dashboard's fixed
     *  14-day window, this takes an arbitrary caller-supplied range. */
    @Transactional(readOnly = true)
    public List<DashboardSummaryDto.BlockedTask> getBlockers(Long employeeId, LocalDate from, LocalDate to) {
        return buildBlockedTasks(employeeId, from, to);
    }

    private List<DashboardSummaryDto.BlockedTask> buildBlockedTasks(Long employeeId, LocalDate from, LocalDate to) {
        List<EodEntry> recent = entryRepository
                .findByEmployeeIdAndEntryDateBetweenOrderByEntryDateDesc(employeeId, from, to);
        return blockedTasksFrom(recent, from);
    }

    /** Shared with getDashboardSummary, which already has a 30-day entry fetch on hand and
     *  passes it straight in rather than repeating buildBlockedTasks' own query for its
     *  (always-narrower) 14-day window. */
    private List<DashboardSummaryDto.BlockedTask> blockedTasksFrom(List<EodEntry> entries, LocalDate from) {
        List<DashboardSummaryDto.BlockedTask> blocked = new ArrayList<>();
        for (EodEntry entry : entries) {
            if (entry.getEntryDate().isBefore(from)) continue;
            if (entry.getStatus() == EodEntry.Status.MISSED) continue;
            for (EodTask task : entry.getTasks()) {
                if (task.getTaskStatus() == EodTask.TaskStatus.BLOCKED) {
                    String projectName = task.getProject() != null ? task.getProject().getName() : "—";
                    String categoryName = task.getTaskCategory() != null ? task.getTaskCategory().getName() : null;
                    blocked.add(new DashboardSummaryDto.BlockedTask(
                            task.getId(),
                            entry.getId(),
                            entry.getEntryDate(),
                            projectName,
                            categoryName,
                            task.getDescription(),
                            task.getBlockerReason(),
                            task.getAcknowledgedAt() != null,
                            task.getAcknowledgedAt(),
                            task.getAcknowledgedBy() != null ? task.getAcknowledgedBy().getFullName() : null,
                            task.getBlockerStatus(),
                            task.getResolvedAt(),
                            task.getResolvedBy() != null ? task.getResolvedBy().getFullName() : null
                    ));
                }
            }
        }
        return blocked;
    }

    /** Takes the same 30-day entry list and snapshot map getDashboardSummary already fetched
     *  (in parallel, alongside this method's other independent reads) rather than re-querying
     *  either here. */
    private List<DashboardSummaryDto.RecentEntry> buildRecentEntries(
            List<EodEntry> entries, Map<LocalDate, UtilSnapshot> snapMap) {
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

        // Lightweight projection: only entryDate/status are read below, so this skips the
        // tasks/project/category join that the full-entity fetch would otherwise always pay for.
        Map<LocalDate, String> statusMap = entryRepository
                .findEntryDateAndStatusByEmployeeIdAndEntryDateBetween(employeeId, gridStart, gridEnd)
                .stream()
                .collect(Collectors.toMap(EodEntryRepository.EntryDateStatusView::getEntryDate,
                        v -> v.getStatus().name()));

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

        // Same source of truth as the Holiday Calendar admin screen and every other
        // holiday-aware report (see MissingEodReportService): weekend > holiday > future
        // > actual entry status, so a holiday never reads as a missed/empty working day.
        Map<LocalDate, String> holidayMap = holidayRepository.findByHolidayDateBetween(gridStart, gridEnd).stream()
                .collect(Collectors.toMap(Holiday::getHolidayDate, Holiday::getName));

        // Only a day the employee was actually staffed on counts as MISSED when no entry was
        // filed — same "project allocation is the test for owing an EOD" rule the reminder
        // scheduler and Missing EOD report use. An unallocated employee reads as EMPTY (No
        // entry), not MISSED, since nothing was ever owed for that day.
        List<Allocation> allocations = allocationRepository.findByEmployeeId(employeeId);

        List<DashboardSummaryDto.CalendarDay> days = new ArrayList<>();
        LocalDate cursor = gridStart;
        while (!cursor.isAfter(gridEnd)) {
            boolean weekend = isWeekend(cursor);
            String  holidayName = holidayMap.get(cursor);
            boolean holiday = holidayName != null;
            boolean future  = cursor.isAfter(realToday);
            String status   = statusMap.get(cursor);
            if (weekend) status = "WEEKEND";
            else if (holiday) status = "HOLIDAY";
            else if (future) status = "FUTURE";
            else if (status == null) {
                // Today isn't past its cutoff yet just because the loop has reached it — leave
                // it EMPTY rather than prematurely flagging it MISSED.
                status = (cursor.isBefore(realToday) && isAllocatedOn(allocations, cursor))
                        ? "MISSED" : "EMPTY";
            }
            // A Draft was saved but never submitted — once its day is in the past that's the
            // same outcome as no entry at all, so it reads as MISSED rather than as an
            // in-progress Draft that's actually gone stale.
            else if ("DRAFT".equals(status) && cursor.isBefore(realToday)) {
                status = "MISSED";
            }
            BigDecimal util = utilMap.get(cursor);
            days.add(new DashboardSummaryDto.CalendarDay(cursor, status, util, weekend, future, holiday, holidayName));
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
        BigDecimal productive = sum(snaps, UtilSnapshotDto::approvedProductiveHours);
        BigDecimal bench      = sum(snaps, UtilSnapshotDto::benchHours);
        return new UtilizationDetailDto.CategoryBreakdown(productive, bench, productive);
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
