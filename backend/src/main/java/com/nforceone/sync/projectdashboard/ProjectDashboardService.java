package com.nforceone.sync.projectdashboard;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.eod.dto.CategoryHoursRow;
import com.nforceone.sync.eod.dto.DateHoursRow;
import com.nforceone.sync.eod.dto.EmployeeProjectHoursRow;
import com.nforceone.sync.eod.dto.ProjectHoursRow;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategoryRepository;
import com.nforceone.sync.projectdashboard.dto.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.nforceone.sync.config.Futures;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * Backs the PM-facing Project Dashboard: utilization, planned-vs-actual and EOD-compliance
 * across the projects a Project Manager owns. Strictly scoped server-side to
 * {@code project.pm.id == caller.id} for the PM role (SUPERADMIN may view any PM's portfolio,
 * matching every other PM-facing controller's {@code hasAnyRole('PM','SUPERADMIN')} convention) —
 * filter params are validated against that scope, never trusted blindly.
 */
@Service
@Transactional(readOnly = true)
public class ProjectDashboardService {

    private static final long CONFIG_ID = 1L;

    // Matches TeamLeadService's inference: no dedicated leave-request workflow exists yet, so an
    // entry whose only task falls in this category is treated as approved leave, not a missing EOD.
    private static final String LEAVE_HOLIDAY_CATEGORY = "Leave / Holiday";

    // Wide enough to capture "every allocation ever made" for the filter-options endpoint,
    // without needing a separate all-time repository query.
    private static final LocalDate FAR_PAST = LocalDate.of(2000, 1, 1);
    private static final LocalDate FAR_FUTURE = LocalDate.now().plusYears(5);

    private final AppUserRepository appUserRepository;
    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;
    private final EodTaskRepository eodTaskRepository;
    private final EodEntryRepository eodEntryRepository;
    private final HolidayRepository holidayRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final TaskCategoryRepository taskCategoryRepository;
    private final Executor dashboardQueryExecutor;

    public ProjectDashboardService(AppUserRepository appUserRepository,
                                    ProjectRepository projectRepository,
                                    AllocationRepository allocationRepository,
                                    EodTaskRepository eodTaskRepository,
                                    EodEntryRepository eodEntryRepository,
                                    HolidayRepository holidayRepository,
                                    BusinessRuleConfigRepository configRepository,
                                    TaskCategoryRepository taskCategoryRepository,
                                    Executor dashboardQueryExecutor) {
        this.appUserRepository = appUserRepository;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.eodTaskRepository = eodTaskRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository = configRepository;
        this.taskCategoryRepository = taskCategoryRepository;
        this.dashboardQueryExecutor = dashboardQueryExecutor;
    }

    public ProjectDashboardFiltersDto getFilters(String actingEmail) {
        return getFilters(actingEmail, null);
    }

    public ProjectDashboardFiltersDto getFilters(String actingEmail, Long pmId) {
        AppUser pm = requirePm(actingEmail);
        List<Project> projects = scopedProjects(pm, pmId);
        List<Long> projectIds = projects.stream().map(Project::getId).toList();

        List<ProjectOptionDto> projectOptions = projects.stream()
                .map(p -> new ProjectOptionDto(p.getId(), p.getName(), p.getClient()))
                .toList();

        if (projectIds.isEmpty()) {
            return new ProjectDashboardFiltersDto(projectOptions, List.of(), List.of(), List.of());
        }

        List<Allocation> allocations = allocationRepository.findActiveInRangeForProjects(projectIds, FAR_PAST, FAR_FUTURE);

        Map<Long, AppUser> employeesById = allocations.stream()
                .map(Allocation::getEmployee)
                .collect(Collectors.toMap(AppUser::getId, e -> e, (a, b) -> a));
        List<EmployeeOptionDto> employeeOptions = employeesById.values().stream()
                .sorted(Comparator.comparing(AppUser::getFullName))
                .map(e -> new EmployeeOptionDto(e.getId(), e.getFullName()))
                .toList();

        Map<Long, AppUser> managersById = employeesById.values().stream()
                .map(AppUser::getManager)
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(AppUser::getId, m -> m, (a, b) -> a));
        List<TeamOptionDto> teamOptions = managersById.values().stream()
                .sorted(Comparator.comparing(AppUser::getFullName))
                .map(m -> new TeamOptionDto(m.getId(), m.getFullName()))
                .toList();

        List<String> clients = projects.stream()
                .map(Project::getClient)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();

        return new ProjectDashboardFiltersDto(projectOptions, employeeOptions, teamOptions, clients);
    }

    public ProjectDashboardSummaryDto getSummary(String actingEmail, LocalDate from, LocalDate to,
                                                  Long projectId, Long employeeId, Long teamManagerId,
                                                  String client) {
        return getSummary(actingEmail, from, to, projectId, employeeId, teamManagerId, client, null);
    }

    public ProjectDashboardSummaryDto getSummary(String actingEmail, LocalDate from, LocalDate to,
                                                  Long projectId, Long employeeId, Long teamManagerId,
                                                  String client, Long pmId) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' cannot be before 'from'");
        }

        AppUser pm = requirePm(actingEmail);
        List<Project> projects = scopedProjects(pm, pmId);

        if (projectId != null) {
            Project match = projects.stream().filter(p -> p.getId().equals(projectId)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "Project is not in your portfolio"));
            projects = List.of(match);
        }
        if (client != null && !client.isBlank()) {
            projects = projects.stream().filter(p -> client.equals(p.getClient())).toList();
        }

        int totalAssignedProjects = projects.size();
        int activeProjects = (int) projects.stream().filter(p -> p.getStatus() == Project.Status.ACTIVE).count();
        int onHoldProjects = (int) projects.stream().filter(p -> p.getStatus() == Project.Status.ON_HOLD).count();
        int completedProjects = (int) projects.stream().filter(p -> p.getStatus() == Project.Status.COMPLETED).count();

        List<Long> projectIds = projects.stream().map(Project::getId).toList();
        if (projectIds.isEmpty()) {
            return emptySummary(totalAssignedProjects, activeProjects, onHoldProjects, completedProjects);
        }
        Map<Long, Project> projectsById = projects.stream().collect(Collectors.toMap(Project::getId, p -> p));

        // config/holidays fanned out onto worker threads while the main thread fetches
        // allocations directly — see AsyncQueryConfig/EmployeeService for the general pattern,
        // but allocations specifically must NOT run on a worker thread: Allocation.employee is
        // eager-fetched, but AppUser.manager (touched much later, in computeMissingEod) is not,
        // and once a worker thread's ad-hoc transaction closes, that lazy proxy can never be
        // resolved again by ANY thread (the entity is fully detached) — not just "the wrong
        // thread". Running this one on the request's own (still-open) transaction keeps it safe.
        CompletableFuture<BusinessRuleConfig> configF =
                CompletableFuture.supplyAsync(this::requireConfig, dashboardQueryExecutor);
        // Unfiltered — the previous-period snapshot below needs holiday dates for a DIFFERENT
        // range, and re-querying the same small table there (as it used to) is a fully redundant
        // round trip; filtering per range happens in memory on both sides instead.
        CompletableFuture<Set<LocalDate>> allHolidaysF = CompletableFuture.supplyAsync(() -> holidayRepository
                .findAllByOrderByHolidayDateAsc().stream()
                .map(Holiday::getHolidayDate)
                .collect(Collectors.toSet()),
                dashboardQueryExecutor);
        // Was previously looked up late, inside computeMissingEod, adding its own round trip
        // AFTER every other query had already finished — a fully independent static lookup with
        // no reason not to overlap with everything else here.
        CompletableFuture<Long> leaveCategoryIdF =
                CompletableFuture.supplyAsync(this::leaveCategoryId, dashboardQueryExecutor);

        List<Allocation> allocations = allocationRepository.findActiveInRangeForProjects(projectIds, from, to);

        CompletableFuture.allOf(configF, allHolidaysF, leaveCategoryIdF).join();
        BusinessRuleConfig config = Futures.join(configF);
        BigDecimal standardHours = config.getWorkingHoursPerDay();
        Set<LocalDate> allHolidayDates = Futures.join(allHolidaysF);
        Long leaveCategoryId = Futures.join(leaveCategoryIdF);
        Set<LocalDate> holidayDates = allHolidayDates.stream()
                .filter(d -> !d.isBefore(from) && !d.isAfter(to))
                .collect(Collectors.toSet());

        if (employeeId != null) {
            Allocation match = allocations.stream().filter(a -> a.getEmployee().getId().equals(employeeId)).findFirst()
                    .orElse(null);
            if (match == null) {
                return emptySummary(totalAssignedProjects, activeProjects, onHoldProjects, completedProjects);
            }
            allocations = allocations.stream().filter(a -> a.getEmployee().getId().equals(employeeId)).toList();
        }
        if (teamManagerId != null) {
            allocations = allocations.stream()
                    .filter(a -> a.getEmployee().getManager() != null
                            && a.getEmployee().getManager().getId().equals(teamManagerId))
                    .toList();
        }

        List<Long> employeeIds = allocations.stream()
                .map(a -> a.getEmployee().getId())
                .distinct()
                .toList();
        if (employeeIds.isEmpty()) {
            return emptySummary(totalAssignedProjects, activeProjects, onHoldProjects, completedProjects);
        }
        // `allocations` is reassigned above by the employeeId/teamManagerId filters, so it isn't
        // effectively final — capture a final reference for the parallel missingEodF lambda below.
        List<Allocation> allocationsForMissingEod = allocations;

        // Planned hours per allocation, clipped to the overlap of the allocation's own effective
        // window and the requested range — an allocation that started mid-range should not be
        // credited planned hours for days before it began.
        //
        // Every allocation counts as full-time: allocations no longer carry a percentage (V48
        // dropped allocation_pct), so this used to scale by `allocation_pct / 100` and no longer can.
        BigDecimal totalPlannedHours = BigDecimal.ZERO;
        Map<Long, BigDecimal> plannedByProject = new HashMap<>();
        for (Allocation a : allocations) {
            LocalDate winFrom = maxDate(from, a.getEffectiveFrom());
            LocalDate winTo = a.getEffectiveTo() != null ? minDate(to, a.getEffectiveTo()) : to;
            if (winTo.isBefore(winFrom)) continue;
            int workingDays = countWorkingDays(winFrom, winTo, holidayDates);
            BigDecimal planned = standardHours.multiply(BigDecimal.valueOf(workingDays));
            totalPlannedHours = totalPlannedHours.add(planned);
            plannedByProject.merge(a.getProject().getId(), planned, BigDecimal::add);
        }

        // Previous period (same length, immediately preceding `from`) — used only for the "vs last
        // month" deltas on the KPI cards and the per-project trend sparkline; its raw rows are
        // never returned to the client, only these comparison values.
        long periodDays = ChronoUnit.DAYS.between(from, to) + 1;
        LocalDate prevTo = from.minusDays(1);
        LocalDate prevFrom = from.minusDays(periodDays);

        // Fanned out — none of these 6 depends on another's result, only on allocations/holidayDates
        // already resolved above. See AsyncQueryConfig/EmployeeService.
        CompletableFuture<List<ProjectHoursRow>> actualByProjectRowsF = CompletableFuture.supplyAsync(
                () -> eodTaskRepository.sumHoursByProject(projectIds, employeeIds, from, to), dashboardQueryExecutor);
        CompletableFuture<List<EmployeeProjectHoursRow>> actualByEmpProjRowsF = CompletableFuture.supplyAsync(
                () -> eodTaskRepository.sumHoursByEmployeeAndProject(projectIds, employeeIds, from, to), dashboardQueryExecutor);
        CompletableFuture<List<CategoryHoursRow>> categoryRowsF = CompletableFuture.supplyAsync(
                () -> eodTaskRepository.sumHoursByCategory(projectIds, employeeIds, from, to), dashboardQueryExecutor);
        CompletableFuture<List<DateHoursRow>> dailyRowsF = CompletableFuture.supplyAsync(
                () -> eodTaskRepository.sumHoursByDate(projectIds, employeeIds, from, to), dashboardQueryExecutor);
        CompletableFuture<PeriodSnapshot> previousF = CompletableFuture.supplyAsync(
                () -> computeSnapshot(projectIds, prevFrom, prevTo, config, allHolidayDates), dashboardQueryExecutor);
        // Only the query is fanned out here — computeMissingEod itself (below, after the join)
        // touches Allocation.employee.manager, a lazy relation Hibernate can only resolve on the
        // thread/session that owns the surrounding @Transactional, not on a worker thread.
        List<Long> missingEodEmployeeIds = allocationsForMissingEod.stream()
                .map(a -> a.getEmployee().getId()).distinct().toList();
        CompletableFuture<List<EodEntry>> missingEodEntriesF = CompletableFuture.supplyAsync(
                () -> eodEntryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(missingEodEmployeeIds, from, to),
                dashboardQueryExecutor);

        CompletableFuture.allOf(actualByProjectRowsF, actualByEmpProjRowsF, categoryRowsF,
                dailyRowsF, previousF, missingEodEntriesF).join();

        List<ProjectHoursRow> actualByProjectRows = Futures.join(actualByProjectRowsF);
        Map<Long, BigDecimal> actualByProject = actualByProjectRows.stream()
                .collect(Collectors.toMap(ProjectHoursRow::projectId, ProjectHoursRow::hours));

        List<EmployeeProjectHoursRow> actualByEmpProjRows = Futures.join(actualByEmpProjRowsF);
        Map<String, BigDecimal> actualByEmpProj = actualByEmpProjRows.stream()
                .collect(Collectors.toMap(r -> r.employeeId() + ":" + r.projectId(), EmployeeProjectHoursRow::hours));

        BigDecimal totalActualHours = actualByProject.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        List<CategoryHoursRow> categoryRows = Futures.join(categoryRowsF);
        PeriodSnapshot previous = Futures.join(previousF);

        List<ProjectUtilizationRowDto> projectUtilization = projectIds.stream()
                .map(pid -> {
                    Project p = projectsById.get(pid);
                    BigDecimal planned = plannedByProject.getOrDefault(pid, BigDecimal.ZERO);
                    BigDecimal actual = actualByProject.getOrDefault(pid, BigDecimal.ZERO);
                    BigDecimal variance = actual.subtract(planned);
                    BigDecimal previousPct = previous.utilizationPctByProject().get(pid);
                    return new ProjectUtilizationRowDto(
                            pid, p.getName(), planned, actual, variance, pctOf(actual, planned), previousPct);
                })
                .sorted(Comparator.comparing(ProjectUtilizationRowDto::projectName))
                .toList();

        // Overall (org-standard) available capacity for the period, per distinct employee in scope —
        // the same STANDARD_DAY_HOURS-style denominator UtilizationCalculator uses for org-level %.
        int overallWorkingDays = countWorkingDays(from, to, holidayDates);
        BigDecimal availableHoursPerEmployee = standardHours.multiply(BigDecimal.valueOf(overallWorkingDays));

        List<ResourceUtilizationRowDto> resourceUtilization = allocations.stream()
                .map(a -> {
                    String key = a.getEmployee().getId() + ":" + a.getProject().getId();
                    BigDecimal actual = actualByEmpProj.getOrDefault(key, BigDecimal.ZERO);
                    return new ResourceUtilizationRowDto(
                            a.getEmployee().getId(), a.getEmployee().getFullName(), a.getProject().getName(),
                            actual, availableHoursPerEmployee,
                            pctOf(actual, availableHoursPerEmployee));
                })
                .sorted(Comparator.comparing(ResourceUtilizationRowDto::employeeName))
                .toList();

        // Daily trend series for the Utilization Trend chart / KPI sparklines — each day's actual
        // hours against that day's available capacity (standard hours × employees in scope).
        List<DateHoursRow> dailyRows = Futures.join(dailyRowsF);
        Map<LocalDate, BigDecimal> dailyActual = new HashMap<>();
        for (DateHoursRow row : dailyRows) {
            dailyActual.merge(row.date(), row.hours(), BigDecimal::add);
        }
        BigDecimal dailyAvailableHours = standardHours.multiply(BigDecimal.valueOf(employeeIds.size()));
        List<UtilizationTrendPointDto> utilizationTrend = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            boolean working = !isWeekend(d) && !holidayDates.contains(d);
            BigDecimal dayAvailable = working ? dailyAvailableHours : BigDecimal.ZERO;
            BigDecimal dayActual = dailyActual.getOrDefault(d, BigDecimal.ZERO);
            utilizationTrend.add(new UtilizationTrendPointDto(d, pctOf(dayActual, dayAvailable)));
        }

        BigDecimal totalCategoryHours = categoryRows.stream().map(CategoryHoursRow::hours).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<TaskCategoryUtilizationRowDto> taskCategoryBreakdown = categoryRows.stream()
                .map(r -> new TaskCategoryUtilizationRowDto(r.categoryName(), r.hours(), pctOf(r.hours(), totalCategoryHours)))
                .sorted(Comparator.comparing(TaskCategoryUtilizationRowDto::hours).reversed())
                .toList();

        List<MissingEodRowDto> missingEod = computeMissingEod(
                allocationsForMissingEod, Futures.join(missingEodEntriesF), from, to, holidayDates, config, leaveCategoryId);

        // Total available capacity across every distinct employee in scope — the denominator for
        // the "Planned Utilization %" and "Actual Utilization %" summary cards.
        BigDecimal totalAvailableHours = availableHoursPerEmployee.multiply(BigDecimal.valueOf(employeeIds.size()));

        BigDecimal overallPct = pctOf(totalActualHours, totalPlannedHours);
        BigDecimal actualPct = pctOf(totalActualHours, totalAvailableHours);
        int currentActiveProjectCount = (int) actualByProject.entrySet().stream()
                .filter(e -> e.getValue().compareTo(BigDecimal.ZERO) > 0).count();

        DashboardSummaryCardsDto cards = new DashboardSummaryCardsDto(
                totalAssignedProjects, activeProjects, onHoldProjects, completedProjects,
                // "Overall" reads as performance against plan; "Actual"/"Planned" read against
                // org-standard available capacity — three distinct, non-redundant percentages.
                overallPct,
                pctOf(totalPlannedHours, totalAvailableHours),
                actualPct,
                (int) missingEod.stream().map(MissingEodRowDto::employeeId).distinct().count(),
                previous.hasData() ? overallPct.subtract(previous.overallPct()) : null,
                previous.hasData() ? actualPct.subtract(previous.actualPct()) : null,
                previous.hasData() ? currentActiveProjectCount - previous.activeProjectCount() : null);

        return new ProjectDashboardSummaryDto(
                cards, projectUtilization, resourceUtilization, missingEod, taskCategoryBreakdown, utilizationTrend);
    }

    // ── Previous-period snapshot (for "vs last month" deltas) ──────────────────

    /** Lightweight aggregate over an arbitrary date range, scoped to the given projects — used only
     *  to diff against the current period. Mirrors the planned/actual computation in {@link #getSummary}
     *  but returns just the comparison values, never raw rows, to the client. */
    private record PeriodSnapshot(
            boolean hasData,
            Map<Long, BigDecimal> utilizationPctByProject,
            BigDecimal overallPct,
            BigDecimal actualPct,
            int activeProjectCount
    ) {}

    private static final PeriodSnapshot EMPTY_SNAPSHOT =
            new PeriodSnapshot(false, Map.of(), BigDecimal.ZERO, BigDecimal.ZERO, 0);

    private PeriodSnapshot computeSnapshot(List<Long> projectIds, LocalDate from, LocalDate to,
                                            BusinessRuleConfig config, Set<LocalDate> allHolidayDates) {
        if (projectIds.isEmpty()) return EMPTY_SNAPSHOT;

        List<Allocation> allocations = allocationRepository.findActiveInRangeForProjects(projectIds, from, to);
        List<Long> employeeIds = allocations.stream().map(a -> a.getEmployee().getId()).distinct().toList();
        if (employeeIds.isEmpty()) return EMPTY_SNAPSHOT;

        BigDecimal standardHours = config.getWorkingHoursPerDay();
        Set<LocalDate> holidayDates = allHolidayDates.stream()
                .filter(d -> !d.isBefore(from) && !d.isAfter(to))
                .collect(Collectors.toSet());

        BigDecimal totalPlannedHours = BigDecimal.ZERO;
        Map<Long, BigDecimal> plannedByProject = new HashMap<>();
        for (Allocation a : allocations) {
            LocalDate winFrom = maxDate(from, a.getEffectiveFrom());
            LocalDate winTo = a.getEffectiveTo() != null ? minDate(to, a.getEffectiveTo()) : to;
            if (winTo.isBefore(winFrom)) continue;
            int workingDays = countWorkingDays(winFrom, winTo, holidayDates);
            BigDecimal planned = standardHours.multiply(BigDecimal.valueOf(workingDays));
            totalPlannedHours = totalPlannedHours.add(planned);
            plannedByProject.merge(a.getProject().getId(), planned, BigDecimal::add);
        }

        Map<Long, BigDecimal> actualByProject = eodTaskRepository.sumHoursByProject(projectIds, employeeIds, from, to)
                .stream().collect(Collectors.toMap(ProjectHoursRow::projectId, ProjectHoursRow::hours));

        BigDecimal totalActualHours = actualByProject.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        int overallWorkingDays = countWorkingDays(from, to, holidayDates);
        BigDecimal totalAvailableHours = standardHours.multiply(BigDecimal.valueOf(overallWorkingDays))
                .multiply(BigDecimal.valueOf(employeeIds.size()));

        Map<Long, BigDecimal> utilizationPctByProject = projectIds.stream()
                .collect(Collectors.toMap(pid -> pid, pid -> pctOf(
                        actualByProject.getOrDefault(pid, BigDecimal.ZERO),
                        plannedByProject.getOrDefault(pid, BigDecimal.ZERO))));

        int activeProjectCount = (int) actualByProject.values().stream().filter(v -> v.compareTo(BigDecimal.ZERO) > 0).count();

        return new PeriodSnapshot(
                true, utilizationPctByProject,
                pctOf(totalActualHours, totalPlannedHours),
                pctOf(totalActualHours, totalAvailableHours),
                activeProjectCount);
    }

    // ── Missing EOD breakdown ────────────────────────────────────────────────

    // `entries` — with tasks/project/category eager-fetched, see EodEntryRepository — is fetched
    // by the caller (in parallel, alongside the other independent reads below) rather than
    // queried in here: isLeaveOnlyEntry below calls entry.getTasks() once per employee per
    // working day, and doing that query here would mean it always runs on whatever thread calls
    // this method, defeating the point of fetching it in parallel.
    private List<MissingEodRowDto> computeMissingEod(List<Allocation> allocations, List<EodEntry> entries,
                                                       LocalDate from, LocalDate to, Set<LocalDate> holidayDates,
                                                       BusinessRuleConfig config, Long leaveCategoryId) {
        Map<Long, AppUser> employeesById = allocations.stream()
                .map(Allocation::getEmployee)
                .collect(Collectors.toMap(AppUser::getId, e -> e, (a, b) -> a));
        // First allocated project per employee (by project name) — used only as the display column;
        // an employee split across several of the PM's projects still gets one summary row.
        Map<Long, Project> primaryProjectByEmployee = new HashMap<>();
        for (Allocation a : allocations) {
            primaryProjectByEmployee.merge(a.getEmployee().getId(), a.getProject(),
                    (existing, candidate) -> existing.getName().compareTo(candidate.getName()) <= 0 ? existing : candidate);
        }

        List<Long> employeeIds = new ArrayList<>(employeesById.keySet());
        Map<String, EodEntry> entryByEmpDate = entries.stream()
                .collect(Collectors.toMap(e -> e.getEmployee().getId() + ":" + e.getEntryDate(), e -> e));

        BigDecimal atRiskThresholdPct = config.getAtRiskMissingPct();

        List<MissingEodRowDto> rows = new ArrayList<>();
        for (Long empId : employeeIds) {
            int totalWorkingDays = 0;
            int missingCount = 0;
            LocalDate lastMissingDate = null;
            for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
                if (isWeekend(d) || holidayDates.contains(d)) continue;
                totalWorkingDays++;
                EodEntry entry = entryByEmpDate.get(empId + ":" + d);
                if (isMissing(entry, leaveCategoryId)) {
                    missingCount++;
                    lastMissingDate = d;
                }
            }
            if (missingCount == 0) continue;

            AppUser emp = employeesById.get(empId);
            Project project = primaryProjectByEmployee.get(empId);
            String team = emp.getManager() != null ? emp.getManager().getFullName() : "-";
            BigDecimal missingPct = totalWorkingDays == 0
                    ? BigDecimal.ZERO
                    : BigDecimal.valueOf(missingCount).multiply(BigDecimal.valueOf(100))
                        .divide(BigDecimal.valueOf(totalWorkingDays), 2, RoundingMode.HALF_UP);
            String status = missingPct.compareTo(atRiskThresholdPct) >= 0 ? "AT_RISK" : "MISSING";

            rows.add(new MissingEodRowDto(
                    empId, emp.getFullName(), project != null ? project.getName() : "-", team,
                    lastMissingDate, missingCount, status));
        }

        return rows.stream()
                .sorted(Comparator.comparing(MissingEodRowDto::daysMissing).reversed())
                .toList();
    }

    private boolean isMissing(EodEntry entry, Long leaveCategoryId) {
        if (entry == null) return true;
        if (isLeaveOnlyEntry(entry, leaveCategoryId)) return false;
        return switch (entry.getStatus()) {
            case APPROVED, SUBMITTED -> false;
            case DRAFT, REJECTED, MISSED -> true;
        };
    }

    // TODO(leave-workflow): once a real leave-request/approval feature exists, replace this
    // inference with a direct lookup against approved leave for (employeeId, date). Mirrors
    // TeamLeadService.isLeaveOnlyEntry in spirit, since no shared util exists for it.
    private boolean isLeaveOnlyEntry(EodEntry entry, Long leaveCategoryId) {
        List<EodTask> tasks = entry.getTasks();
        if (tasks.isEmpty()) return false;
        if (leaveCategoryId == null) return false;
        // Compare by id, not t.getTaskCategory().getName(): a Hibernate proxy's .getId() is
        // served from the FK already present on the owning eod_task row (no query), but any
        // other getter — including .getName() — forces a full SELECT of the task_category row,
        // which would try to read manager_id. That column doesn't exist on task_category in this
        // environment (a separate, pre-existing schema gap for the Team-Lead custom-category
        // feature), so any full-row load of TaskCategory fails here — see
        // TaskCategoryRepository.findIdByName for the matching id-only-projection fix on the
        // "resolve the Leave category's id" side of this same comparison.
        return tasks.stream().allMatch(t ->
                t.getTaskCategory() != null && leaveCategoryId.equals(t.getTaskCategory().getId()));
    }

    private Long leaveCategoryId() {
        return taskCategoryRepository.findIdByName(LEAVE_HOLIDAY_CATEGORY).orElse(null);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private AppUser requirePm(String actingEmail) {
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (user.getRole() != AppUser.Role.PM && user.getRole() != AppUser.Role.SUPERADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project Manager access required");
        }
        return user;
    }

    /**
     * {@code pmId} lets a Super Admin narrow the system-wide project list to one specific
     * Project Manager's portfolio (Super Admin Reportee Views enhancement) — ignored for a
     * non-SUPERADMIN caller, who always stays scoped to their own id regardless of what's passed.
     */
    private List<Project> scopedProjects(AppUser pm, Long pmId) {
        if (pm.getRole() == AppUser.Role.SUPERADMIN) {
            if (pmId != null) {
                return projectRepository.findByProjectManagerIdOrderByNameAsc(pmId);
            }
            return projectRepository.findAllWithPmOrderByNameAsc();
        }
        return projectRepository.findByProjectManagerIdOrderByNameAsc(pm.getId());
    }

    private BusinessRuleConfig requireConfig() {
        return configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Business rule configuration missing"));
    }

    private static boolean isWeekend(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }

    private static int countWorkingDays(LocalDate from, LocalDate to, Set<LocalDate> holidayDates) {
        int count = 0;
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (!isWeekend(d) && !holidayDates.contains(d)) count++;
        }
        return count;
    }

    private static LocalDate maxDate(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate minDate(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }

    /** Null-safe percentage; a zero denominator reads as 0% here (unlike UtilizationCalculator's
     *  N/A-on-weekend convention) since an empty plan/total is a real "nothing to report" case. */
    private static BigDecimal pctOf(BigDecimal numerator, BigDecimal denominator) {
        if (denominator == null || denominator.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return numerator.divide(denominator, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static ProjectDashboardSummaryDto emptySummary(int totalAssignedProjects, int activeProjects,
                                                            int onHoldProjects, int completedProjects) {
        DashboardSummaryCardsDto cards = new DashboardSummaryCardsDto(
                totalAssignedProjects, activeProjects, onHoldProjects, completedProjects,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0,
                null, null, null);
        return new ProjectDashboardSummaryDto(cards, List.of(), List.of(), List.of(), List.of(), List.of());
    }
}
