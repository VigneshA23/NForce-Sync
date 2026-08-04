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
import com.nforceone.sync.eod.dto.EmployeeProjectHoursRow;
import com.nforceone.sync.eod.dto.ProjectHoursRow;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.projectdashboard.dto.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Backs the PM-facing Project Dashboard: utilization, billable split, planned-vs-actual and
 * EOD-compliance across the projects a Project Manager owns. Strictly scoped server-side to
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

    public ProjectDashboardService(AppUserRepository appUserRepository,
                                    ProjectRepository projectRepository,
                                    AllocationRepository allocationRepository,
                                    EodTaskRepository eodTaskRepository,
                                    EodEntryRepository eodEntryRepository,
                                    HolidayRepository holidayRepository,
                                    BusinessRuleConfigRepository configRepository) {
        this.appUserRepository = appUserRepository;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.eodTaskRepository = eodTaskRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository = configRepository;
    }

    public ProjectDashboardFiltersDto getFilters(String actingEmail) {
        AppUser pm = requirePm(actingEmail);
        List<Project> projects = scopedProjects(pm);
        List<Long> projectIds = projects.stream().map(Project::getId).toList();

        List<ProjectOptionDto> projectOptions = projects.stream()
                .map(p -> new ProjectOptionDto(p.getId(), p.getName()))
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
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' cannot be before 'from'");
        }

        AppUser pm = requirePm(actingEmail);
        List<Project> projects = scopedProjects(pm);

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

        List<Allocation> allocations = allocationRepository.findActiveInRangeForProjects(projectIds, from, to);

        if (employeeId != null) {
            Allocation match = allocations.stream().filter(a -> a.getEmployee().getId().equals(employeeId)).findFirst()
                    .orElse(null);
            if (match == null) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Employee is not allocated to your projects in this range");
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

        BusinessRuleConfig config = requireConfig();
        BigDecimal standardHours = config.getWorkingHoursPerDay();
        Set<LocalDate> holidayDates = holidayRepository.findAllByOrderByHolidayDateAsc().stream()
                .map(Holiday::getHolidayDate)
                .filter(d -> !d.isBefore(from) && !d.isAfter(to))
                .collect(Collectors.toSet());

        // Planned hours per allocation, clipped to the overlap of the allocation's own effective
        // window and the requested range — an allocation that started mid-range should not be
        // credited planned hours for days before it began.
        BigDecimal totalPlannedHours = BigDecimal.ZERO;
        Map<Long, BigDecimal> plannedByProject = new HashMap<>();
        for (Allocation a : allocations) {
            LocalDate winFrom = maxDate(from, a.getEffectiveFrom());
            LocalDate winTo = a.getEffectiveTo() != null ? minDate(to, a.getEffectiveTo()) : to;
            if (winTo.isBefore(winFrom)) continue;
            int workingDays = countWorkingDays(winFrom, winTo, holidayDates);
            BigDecimal planned = standardHours
                    .multiply(BigDecimal.valueOf(workingDays))
                    .multiply(BigDecimal.valueOf(a.getAllocationPct()))
                    .divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            totalPlannedHours = totalPlannedHours.add(planned);
            plannedByProject.merge(a.getProject().getId(), planned, BigDecimal::add);
        }

        List<ProjectHoursRow> actualByProjectRows =
                eodTaskRepository.sumHoursByProject(projectIds, employeeIds, from, to);
        Map<Long, BigDecimal> actualByProject = actualByProjectRows.stream()
                .collect(Collectors.toMap(ProjectHoursRow::projectId, ProjectHoursRow::hours));

        List<EmployeeProjectHoursRow> actualByEmpProjRows =
                eodTaskRepository.sumHoursByEmployeeAndProject(projectIds, employeeIds, from, to);
        Map<String, BigDecimal> actualByEmpProj = actualByEmpProjRows.stream()
                .collect(Collectors.toMap(r -> r.employeeId() + ":" + r.projectId(), EmployeeProjectHoursRow::hours));

        BigDecimal billableHours = nz(eodTaskRepository.sumHoursByBillable(projectIds, employeeIds, true, from, to));
        BigDecimal nonBillableHours = nz(eodTaskRepository.sumHoursByBillable(projectIds, employeeIds, false, from, to));
        BigDecimal totalActualHours = billableHours.add(nonBillableHours);

        List<CategoryHoursRow> categoryRows = eodTaskRepository.sumHoursByCategory(projectIds, employeeIds, from, to);

        List<ProjectUtilizationRowDto> projectUtilization = projectIds.stream()
                .map(pid -> {
                    Project p = projectsById.get(pid);
                    BigDecimal planned = plannedByProject.getOrDefault(pid, BigDecimal.ZERO);
                    BigDecimal actual = actualByProject.getOrDefault(pid, BigDecimal.ZERO);
                    BigDecimal variance = actual.subtract(planned);
                    return new ProjectUtilizationRowDto(pid, p.getName(), planned, actual, variance, pctOf(actual, planned));
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
                            a.getAllocationPct(), actual, availableHoursPerEmployee,
                            pctOf(actual, availableHoursPerEmployee));
                })
                .sorted(Comparator.comparing(ResourceUtilizationRowDto::employeeName))
                .toList();

        BillableSplitDto billableSplit = new BillableSplitDto(
                billableHours, nonBillableHours, pctOf(billableHours, totalActualHours), pctOf(nonBillableHours, totalActualHours));

        BigDecimal plannedVariance = totalActualHours.subtract(totalPlannedHours);
        PlannedVsActualDto plannedVsActual = new PlannedVsActualDto(
                totalPlannedHours, totalActualHours, plannedVariance, pctOf(plannedVariance, totalPlannedHours));

        BigDecimal totalCategoryHours = categoryRows.stream().map(CategoryHoursRow::hours).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<TaskCategoryUtilizationRowDto> taskCategoryBreakdown = categoryRows.stream()
                .map(r -> new TaskCategoryUtilizationRowDto(r.categoryName(), r.hours(), pctOf(r.hours(), totalCategoryHours)))
                .sorted(Comparator.comparing(TaskCategoryUtilizationRowDto::hours).reversed())
                .toList();

        List<MissingEodRowDto> missingEod = computeMissingEod(allocations, from, to, holidayDates, config);

        // Total available capacity across every distinct employee in scope — the denominator for
        // the "Planned Utilization %" and "Actual Utilization %" summary cards.
        BigDecimal totalAvailableHours = availableHoursPerEmployee.multiply(BigDecimal.valueOf(employeeIds.size()));

        DashboardSummaryCardsDto cards = new DashboardSummaryCardsDto(
                totalAssignedProjects, activeProjects, onHoldProjects, completedProjects,
                // "Overall" reads as performance against plan; "Actual"/"Planned" read against
                // org-standard available capacity — three distinct, non-redundant percentages.
                pctOf(totalActualHours, totalPlannedHours),
                billableSplit.billablePct(),
                billableSplit.nonBillablePct(),
                pctOf(totalPlannedHours, totalAvailableHours),
                pctOf(totalActualHours, totalAvailableHours),
                (int) missingEod.stream().map(MissingEodRowDto::employeeId).distinct().count());

        return new ProjectDashboardSummaryDto(
                cards, projectUtilization, resourceUtilization, billableSplit, plannedVsActual, missingEod, taskCategoryBreakdown);
    }

    // ── Missing EOD breakdown ────────────────────────────────────────────────

    private List<MissingEodRowDto> computeMissingEod(List<Allocation> allocations, LocalDate from, LocalDate to,
                                                       Set<LocalDate> holidayDates, BusinessRuleConfig config) {
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
        List<EodEntry> entries = eodEntryRepository.findByEmployeeIdInAndEntryDateBetween(employeeIds, from, to);
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
                if (isMissing(entry)) {
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

    private boolean isMissing(EodEntry entry) {
        if (entry == null) return true;
        if (isLeaveOnlyEntry(entry)) return false;
        return switch (entry.getStatus()) {
            case APPROVED, SUBMITTED -> false;
            case DRAFT, REJECTED, CHANGES_REQUESTED, MISSED -> true;
        };
    }

    // TODO(leave-workflow): once a real leave-request/approval feature exists, replace this
    // inference with a direct lookup against approved leave for (employeeId, date). Mirrors
    // TeamLeadService.isLeaveOnlyEntry exactly, since no shared util exists for it.
    private boolean isLeaveOnlyEntry(EodEntry entry) {
        List<EodTask> tasks = entry.getTasks();
        if (tasks.isEmpty()) return false;
        return tasks.stream().allMatch(t ->
                t.getTaskCategory() != null && LEAVE_HOLIDAY_CATEGORY.equals(t.getTaskCategory().getName()));
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

    private List<Project> scopedProjects(AppUser pm) {
        if (pm.getRole() == AppUser.Role.SUPERADMIN) {
            return projectRepository.findAllWithPmOrderByNameAsc();
        }
        return projectRepository.findByPmIdOrderByNameAsc(pm.getId());
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

    private static BigDecimal nz(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
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
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0);
        BillableSplitDto billableSplit = new BillableSplitDto(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        PlannedVsActualDto plannedVsActual = new PlannedVsActualDto(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        return new ProjectDashboardSummaryDto(cards, List.of(), List.of(), billableSplit, plannedVsActual, List.of(), List.of());
    }
}
