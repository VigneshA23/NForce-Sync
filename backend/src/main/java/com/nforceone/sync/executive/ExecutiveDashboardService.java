package com.nforceone.sync.executive;

import com.nforceone.sync.admin.dto.AuditLogDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.executive.dto.AllocationOverviewDto;
import com.nforceone.sync.executive.dto.EmployeeUtilizationDto;
import com.nforceone.sync.executive.dto.EodComplianceDto;
import com.nforceone.sync.executive.dto.EodComplianceTrendPointDto;
import com.nforceone.sync.executive.dto.ExecutiveDashboardDto;
import com.nforceone.sync.executive.dto.ProjectAllocationDto;
import com.nforceone.sync.executive.dto.ProjectAttentionDto;
import com.nforceone.sync.executive.dto.ProjectPortfolioDto;
import com.nforceone.sync.executive.dto.UnallocatedResourceDto;
import com.nforceone.sync.executive.dto.UtilizationOverviewDto;
import com.nforceone.sync.executive.dto.UtilizationTrendPointDto;
import com.nforceone.sync.executive.dto.WorkforceOverviewDto;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.reports.TeamMissingEodReportService;
import com.nforceone.sync.reports.dto.MissingEodDayDto;
import com.nforceone.sync.reports.dto.MissingEodReportDto;
import com.nforceone.sync.reports.dto.MissingEodRowDto;
import com.nforceone.sync.utilization.UtilSnapshotRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Backs the Super Admin Executive Dashboard — organization-wide oversight, read-only.
 * Every metric here reuses an existing calculation/business rule from elsewhere in the
 * application (UtilizationCalculator, BusinessRuleConfig thresholds, TeamMissingEodReportService's
 * missing-EOD detection, the same repositories other SUPERADMIN-scoped services already call) —
 * this service only aggregates them at the organization level. No new formulas, no Billable/
 * Non-Billable classification, no user-administration actions.
 */
@Service
@Transactional(readOnly = true)
public class ExecutiveDashboardService {

    private static final long CONFIG_ID = 1L;
    private static final int TOP_BOTTOM_LIMIT = 5;
    private static final int ATTENTION_LIMIT = 20;
    private static final int ALLOCATION_BY_PROJECT_LIMIT = 25;

    private final AppUserRepository appUserRepository;
    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;
    private final UtilSnapshotRepository utilSnapshotRepository;
    private final HolidayRepository holidayRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final AuditLogRepository auditLogRepository;
    private final TeamMissingEodReportService teamMissingEodReportService;

    public ExecutiveDashboardService(AppUserRepository appUserRepository,
                                      ProjectRepository projectRepository,
                                      AllocationRepository allocationRepository,
                                      UtilSnapshotRepository utilSnapshotRepository,
                                      HolidayRepository holidayRepository,
                                      BusinessRuleConfigRepository configRepository,
                                      AuditLogRepository auditLogRepository,
                                      TeamMissingEodReportService teamMissingEodReportService) {
        this.appUserRepository = appUserRepository;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.utilSnapshotRepository = utilSnapshotRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository = configRepository;
        this.auditLogRepository = auditLogRepository;
        this.teamMissingEodReportService = teamMissingEodReportService;
    }

    public ExecutiveDashboardDto getDashboard(String actingEmail, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' cannot be before 'from'");
        }

        BusinessRuleConfig config = configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Business rule configuration missing"));

        List<Project> allProjects = projectRepository.findAllWithPmOrderByNameAsc();
        List<AppUser> activeEmployees = appUserRepository.findByRoleAndStatusAndDeletedAtIsNullOrderByFullNameAsc(
                AppUser.Role.EMPLOYEE, AppUser.Status.ACTIVE);

        List<Long> allProjectIds = allProjects.stream().map(Project::getId).toList();
        List<Allocation> allActiveAllocations = allProjectIds.isEmpty()
                ? List.of()
                : allocationRepository.findActiveInRangeForProjects(allProjectIds, from, to);

        // "Resource" allocation/utilization is scoped to the exact same active-EMPLOYEE population
        // everywhere — matches the existing convention (see AllocationRepository
        // .countByProjectIdAndEmployeeRole: "counts only EMPLOYEE-role allocations ... a plain
        // count would include leads and back-office accounts"). Filtering by role alone is not
        // enough: an allocation row can outlive an employee's deactivation, so a Team Lead/PM
        // row OR a since-deactivated employee's stale row would otherwise inflate a project's
        // per-project resource count past the org-wide active-EMPLOYEE total.
        Set<Long> activeEmployeeIds = activeEmployees.stream().map(AppUser::getId).collect(Collectors.toSet());
        List<Allocation> activeAllocations = allActiveAllocations.stream()
                .filter(a -> activeEmployeeIds.contains(a.getEmployee().getId()))
                .toList();

        // Computed once and shared: this is the most expensive call in the whole dashboard (loads
        // every active user, their allocations, and every EOD entry+task in range, then does a
        // per-employee/per-day pass) and both buildEodCompliance and buildProjectsRequiringAttention
        // used to call it separately with identical arguments — silently doubling the slowest part
        // of the request for no reason.
        MissingEodReportDto missingReport = teamMissingEodReportService.getReport(actingEmail, from, to, null, null);

        WorkforceOverviewDto workforce = buildWorkforce();
        ProjectPortfolioDto projects = buildProjects(allProjects);
        EodComplianceDto eodCompliance = buildEodCompliance(missingReport, from, to);
        UtilizationOverviewDto utilization = buildUtilization(activeEmployees, activeAllocations, from, to, config);
        AllocationOverviewDto allocation = buildAllocation(activeEmployees, activeAllocations);
        List<ProjectAttentionDto> attention = buildProjectsRequiringAttention(
                allProjects, activeAllocations, missingReport);
        List<AuditLogDto> recentActivity = auditLogRepository
                .findTop10ByEntityTypeNotOrderByOccurredAtDesc("EOD_ENTRY")
                .stream().map(AuditLogDto::from).toList();

        return new ExecutiveDashboardDto(from, to, workforce, projects, eodCompliance, utilization,
                allocation, attention, recentActivity);
    }

    // ── Workforce ────────────────────────────────────────────────────────────────

    private WorkforceOverviewDto buildWorkforce() {
        long total = appUserRepository.countByDeletedAtIsNull();
        long active = appUserRepository.countByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE);
        long inactive = appUserRepository.countByStatusAndDeletedAtIsNull(AppUser.Status.INACTIVE);

        Map<String, Long> byRole = new LinkedHashMap<>();
        for (Object[] row : appUserRepository.countGroupedByRoleAndStatus()) {
            AppUser.Role role = (AppUser.Role) row[0];
            long cnt = (Long) row[2];
            byRole.merge(role.name(), cnt, Long::sum);
        }
        for (AppUser.Role role : AppUser.Role.values()) {
            byRole.putIfAbsent(role.name(), 0L);
        }
        return new WorkforceOverviewDto(total, active, inactive, byRole);
    }

    // ── Project portfolio ────────────────────────────────────────────────────────

    private ProjectPortfolioDto buildProjects(List<Project> allProjects) {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (Project.Status s : Project.Status.values()) byStatus.put(s.name(), 0L);
        for (Object[] row : projectRepository.countGroupedByStatus()) {
            Project.Status status = (Project.Status) row[0];
            long cnt = (Long) row[1];
            byStatus.merge(status.name(), cnt, Long::sum);
        }
        long total = allProjects.size();
        return new ProjectPortfolioDto(
                total,
                byStatus.getOrDefault("ACTIVE", 0L),
                byStatus.getOrDefault("ON_HOLD", 0L),
                byStatus.getOrDefault("COMPLETED", 0L),
                byStatus.getOrDefault("INACTIVE", 0L),
                byStatus);
    }

    // ── EOD compliance ───────────────────────────────────────────────────────────

    private boolean isWeekend(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }

    private EodComplianceDto buildEodCompliance(MissingEodReportDto missingReport, LocalDate from, LocalDate to) {
        long activeUserCount = appUserRepository.countByStatusAndDeletedAtIsNull(AppUser.Status.ACTIVE);

        Set<LocalDate> holidays = holidayRepository.findByHolidayDateBetween(from, to).stream()
                .map(Holiday::getHolidayDate).collect(Collectors.toSet());

        List<LocalDate> workingDays = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (!isWeekend(d) && !holidays.contains(d)) workingDays.add(d);
        }

        long expected = activeUserCount * workingDays.size();

        // Reuses the exact existing missing-EOD detection (shift cutoffs, holiday/leave/weekend
        // handling, at-risk threshold) — org-wide because the acting caller is SUPERADMIN, whose
        // "team" resolves to every active user (see TeamMissingEodReportService.getTeamMembers).
        // Passed in by getDashboard, computed once and shared with buildProjectsRequiringAttention.
        long missingTotal = missingReport.totalMissingDays();
        long submitted = Math.max(expected - missingTotal, 0);
        BigDecimal compliancePct = compliancePct(submitted, expected);

        Map<LocalDate, Long> missingPerDay = new HashMap<>();
        for (LocalDate d : workingDays) missingPerDay.put(d, 0L);
        for (MissingEodRowDto row : missingReport.employees()) {
            for (MissingEodDayDto day : row.days()) {
                if ("MISSED".equals(day.status()) && missingPerDay.containsKey(day.date())) {
                    missingPerDay.merge(day.date(), 1L, Long::sum);
                }
            }
        }

        List<EodComplianceTrendPointDto> trend = new ArrayList<>();
        for (LocalDate d : workingDays) {
            long m = missingPerDay.getOrDefault(d, 0L);
            long sub = Math.max(activeUserCount - m, 0);
            trend.add(new EodComplianceTrendPointDto(d, activeUserCount, sub, m, compliancePct(sub, activeUserCount)));
        }

        return new EodComplianceDto(expected, submitted, missingTotal, compliancePct, trend);
    }

    private BigDecimal compliancePct(long submitted, long expected) {
        if (expected <= 0) return BigDecimal.ZERO;
        return BigDecimal.valueOf(submitted).multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(expected), 2, RoundingMode.HALF_UP);
    }

    // ── Utilization ──────────────────────────────────────────────────────────────

    private UtilizationOverviewDto buildUtilization(List<AppUser> activeEmployees,
                                                      List<Allocation> activeAllocations,
                                                      LocalDate from, LocalDate to,
                                                      BusinessRuleConfig config) {
        BigDecimal underThreshold = config.getUnderutilizedThresholdPct();
        BigDecimal overThreshold = config.getOverloadedThresholdPct();

        if (activeEmployees.isEmpty()) {
            return new UtilizationOverviewDto(null, BigDecimal.ZERO, BigDecimal.ZERO, 0, 0,
                    underThreshold, overThreshold, List.of(), List.of(), List.of());
        }

        List<Long> employeeIds = activeEmployees.stream().map(AppUser::getId).toList();
        Map<Long, AppUser> employeesById = activeEmployees.stream()
                .collect(Collectors.toMap(AppUser::getId, e -> e));

        // Primary project per employee — first (alphabetically) active allocation, display only.
        Map<Long, String> primaryProjectByEmployee = new HashMap<>();
        for (Allocation a : activeAllocations) {
            Long empId = a.getEmployee().getId();
            if (!employeesById.containsKey(empId)) continue;
            String name = a.getProject().getName();
            primaryProjectByEmployee.merge(empId, name, (existing, candidate) -> existing.compareTo(candidate) <= 0 ? existing : candidate);
        }

        List<Object[]> hoursRows = utilSnapshotRepository.sumHoursInRange(employeeIds, from, to);
        BigDecimal totalProductive = BigDecimal.ZERO;
        BigDecimal totalAvailable = BigDecimal.ZERO;
        if (!hoursRows.isEmpty()) {
            Object[] row = hoursRows.get(0);
            if (row[0] != null) totalProductive = (BigDecimal) row[0];
            if (row[1] != null) totalAvailable = (BigDecimal) row[1];
        }
        // Reuses UtilizationCalculator's exact canonical formula — no new math.
        BigDecimal overallPct = com.nforceone.sync.utilization.UtilizationCalculator
                .computeUtilizationPct(totalProductive, totalAvailable);

        List<Object[]> avgRows = utilSnapshotRepository.avgUtilizationByEmployeeInRange(employeeIds, from, to);
        Map<Long, BigDecimal> avgByEmployee = new LinkedHashMap<>();
        for (Object[] row : avgRows) {
            Long empId = (Long) row[0];
            BigDecimal avg = ((Number) row[1]).doubleValue() == 0 ? BigDecimal.ZERO
                    : BigDecimal.valueOf(((Number) row[1]).doubleValue()).setScale(2, RoundingMode.HALF_UP);
            avgByEmployee.put(empId, avg);
        }

        int underutilized = 0, overloaded = 0;
        for (BigDecimal pct : avgByEmployee.values()) {
            if (pct.compareTo(underThreshold) < 0) underutilized++;
            if (pct.compareTo(overThreshold) > 0) overloaded++;
        }

        List<Map.Entry<Long, BigDecimal>> sorted = avgByEmployee.entrySet().stream()
                .sorted(Map.Entry.comparingByValue(Comparator.reverseOrder()))
                .toList();

        List<EmployeeUtilizationDto> topUtilized = sorted.stream()
                .limit(TOP_BOTTOM_LIMIT)
                .map(e -> toEmployeeUtilDto(e, employeesById, primaryProjectByEmployee))
                .toList();

        List<Map.Entry<Long, BigDecimal>> sortedAscending = avgByEmployee.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .toList();
        List<EmployeeUtilizationDto> bottomUtilized = sortedAscending.stream()
                .limit(TOP_BOTTOM_LIMIT)
                .map(e -> toEmployeeUtilDto(e, employeesById, primaryProjectByEmployee))
                .toList();

        List<Object[]> dailyRows = utilSnapshotRepository.avgUtilizationByDateInRange(employeeIds, from, to);
        List<UtilizationTrendPointDto> trend = dailyRows.stream()
                .map(row -> new UtilizationTrendPointDto((LocalDate) row[0],
                        BigDecimal.valueOf(((Number) row[1]).doubleValue()).setScale(2, RoundingMode.HALF_UP)))
                .toList();

        return new UtilizationOverviewDto(overallPct, totalProductive, totalAvailable,
                underutilized, overloaded, underThreshold, overThreshold, topUtilized, bottomUtilized, trend);
    }

    private EmployeeUtilizationDto toEmployeeUtilDto(Map.Entry<Long, BigDecimal> entry,
                                                       Map<Long, AppUser> employeesById,
                                                       Map<Long, String> primaryProjectByEmployee) {
        AppUser emp = employeesById.get(entry.getKey());
        return new EmployeeUtilizationDto(entry.getKey(), emp.getFullName(), emp.getEmployeeCode(),
                entry.getValue(), primaryProjectByEmployee.get(entry.getKey()));
    }

    // ── Resource allocation ──────────────────────────────────────────────────────

    private AllocationOverviewDto buildAllocation(List<AppUser> activeEmployees, List<Allocation> activeAllocations) {
        Set<Long> allocatedEmployeeIds = activeAllocations.stream()
                .map(a -> a.getEmployee().getId()).collect(Collectors.toSet());

        long totalAllocatedResources = activeEmployees.stream()
                .filter(e -> allocatedEmployeeIds.contains(e.getId())).count();
        long noActiveAllocation = activeEmployees.size() - totalAllocatedResources;

        List<UnallocatedResourceDto> unallocatedResources = activeEmployees.stream()
                .filter(e -> !allocatedEmployeeIds.contains(e.getId()))
                .map(e -> new UnallocatedResourceDto(e.getId(), e.getFullName(), e.getEmployeeCode(), e.getRole().name()))
                .sorted(Comparator.comparing(UnallocatedResourceDto::employeeName))
                .toList();

        Map<Long, List<Allocation>> byProject = activeAllocations.stream()
                .collect(Collectors.groupingBy(a -> a.getProject().getId()));

        List<ProjectAllocationDto> byProjectList = byProject.entrySet().stream()
                .map(e -> {
                    List<Allocation> rows = e.getValue();
                    Project project = rows.get(0).getProject();
                    long distinctEmployees = rows.stream().map(a -> a.getEmployee().getId()).distinct().count();
                    int pctTotal = rows.stream().mapToInt(Allocation::getAllocationPct).sum();
                    return new ProjectAllocationDto(project.getId(), project.getName(), distinctEmployees, pctTotal);
                })
                .sorted(Comparator.comparingLong(ProjectAllocationDto::allocatedResources).reversed())
                .limit(ALLOCATION_BY_PROJECT_LIMIT)
                .toList();

        return new AllocationOverviewDto(totalAllocatedResources, noActiveAllocation, byProjectList, unallocatedResources);
    }

    // ── Projects requiring attention ─────────────────────────────────────────────

    private List<ProjectAttentionDto> buildProjectsRequiringAttention(List<Project> allProjects,
                                                                        List<Allocation> activeAllocations,
                                                                        MissingEodReportDto missingReport) {
        List<ProjectAttentionDto> attention = new ArrayList<>();

        Set<Long> projectsWithAllocation = activeAllocations.stream()
                .map(a -> a.getProject().getId()).collect(Collectors.toSet());

        for (Project p : allProjects) {
            if (p.getStatus() != Project.Status.ACTIVE) continue;
            if (!projectsWithAllocation.contains(p.getId())) {
                attention.add(new ProjectAttentionDto(p.getId(), p.getName(),
                        p.getProjectManager() != null ? p.getProjectManager().getFullName() : null,
                        p.getStatus().name(), "0 active resources", "No active resource allocation"));
            }
        }

        // Reuses TeamMissingEodReportService's existing AT_RISK classification (BusinessRuleConfig
        // .atRiskMissingPct) rather than inventing a new project health score.
        Map<String, Project> projectByName = new HashMap<>();
        for (Project p : allProjects) projectByName.putIfAbsent(p.getName(), p);

        Map<String, Long> atRiskCountByProject = missingReport.employees().stream()
                .filter(r -> "AT_RISK".equals(r.status()) && r.projectName() != null)
                .collect(Collectors.groupingBy(MissingEodRowDto::projectName, Collectors.counting()));

        for (Map.Entry<String, Long> e : atRiskCountByProject.entrySet()) {
            Project p = projectByName.get(e.getKey());
            if (p == null) continue;
            attention.add(new ProjectAttentionDto(p.getId(), p.getName(),
                    p.getProjectManager() != null ? p.getProjectManager().getFullName() : null,
                    p.getStatus().name(), e.getValue() + " employee(s) at-risk for missing EOD",
                    "High missing-EOD rate (at or above configured threshold)"));
        }

        return attention.stream()
                .sorted(Comparator.comparing(ProjectAttentionDto::projectName))
                .limit(ATTENTION_LIMIT)
                .toList();
    }
}
