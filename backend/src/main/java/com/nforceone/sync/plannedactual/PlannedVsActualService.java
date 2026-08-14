package com.nforceone.sync.plannedactual;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.Holiday;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.eod.dto.EmployeeProjectHoursRow;
import com.nforceone.sync.eod.dto.ProjectHoursRow;
import com.nforceone.sync.plannedactual.dto.PlannedVsActualCardsDto;
import com.nforceone.sync.plannedactual.dto.PlannedVsActualProjectRowDto;
import com.nforceone.sync.plannedactual.dto.PlannedVsActualResourceRowDto;
import com.nforceone.sync.plannedactual.dto.PlannedVsActualSummaryDto;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.utilization.UtilizationCalculator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Backs the PM-facing "Planned vs Actual Utilization" tab.
 *
 * <p>PLANNED comes from the existing project/resource allocation records ({@link Allocation}):
 * {@code available hours for the allocation's window x allocationPct / 100}, for the days its
 * effective window overlaps the requested range. {@code allocation_pct} (V61) is a genuine
 * per-allocation capacity share — an employee split across concurrent projects (e.g. 50/30/20)
 * plans each one at its own share, not 100% each. Note this is NOT the same denominator
 * {@code ProjectDashboardService} uses for its own (unrelated, unchanged) planned-hours math on
 * the Project Dashboard / Projects Utilization tabs — see that class if the two are ever compared
 * side by side.
 *
 * <p>ACTUAL comes from approved EOD task hours restricted to productive task categories
 * ({@code EodTaskRepository.sumProductiveHours*}) — rejected/unapproved/non-productive
 * (bench, unassigned, etc.) hours are excluded.
 *
 * <p>AVAILABLE hours are computed per employee, per day, via {@link UtilizationCalculator} —
 * the same weekend/company-holiday/approved-full-day-leave rule already used by
 * {@code UtilizationService} for My/Team Utilization — rather than {@code ProjectDashboardService}'s
 * coarser org-standard estimate, so an individual's approved leave genuinely reduces their
 * available (and therefore planned) hours, per the PRD's Available Working Hours rule.
 *
 * <p>Scoped server-side to {@code project.projectManager.id == caller.id} for the PM role
 * (SUPERADMIN may view any PM's portfolio), matching every other PM-facing controller.
 */
@Service
@Transactional(readOnly = true)
public class PlannedVsActualService {

    private static final long CONFIG_ID = 1L;
    private static final BigDecimal HOURS_EPSILON = new BigDecimal("0.01");

    private final AppUserRepository appUserRepository;
    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;
    private final EodTaskRepository eodTaskRepository;
    private final EodEntryRepository eodEntryRepository;
    private final HolidayRepository holidayRepository;
    private final BusinessRuleConfigRepository configRepository;

    public PlannedVsActualService(AppUserRepository appUserRepository,
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

    public PlannedVsActualSummaryDto getSummary(String actingEmail, LocalDate from, LocalDate to,
                                                 Long projectId, Long employeeId) {
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

        List<Long> projectIds = projects.stream().map(Project::getId).toList();
        if (projectIds.isEmpty()) {
            return emptySummary(0);
        }
        Map<Long, Project> projectsById = projects.stream().collect(Collectors.toMap(Project::getId, p -> p));

        List<Allocation> allocations = allocationRepository.findActiveInRangeForProjects(projectIds, from, to);

        if (employeeId != null) {
            boolean employeeInScope = allocations.stream()
                    .anyMatch(a -> a.getEmployee().getId().equals(employeeId));
            if (!employeeInScope) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Employee is not allocated to your projects in this range");
            }
            allocations = allocations.stream().filter(a -> a.getEmployee().getId().equals(employeeId)).toList();
        }

        if (allocations.isEmpty()) {
            return emptySummary(projects.size());
        }

        Map<Long, AppUser> employeesById = allocations.stream()
                .map(Allocation::getEmployee)
                .collect(Collectors.toMap(AppUser::getId, e -> e, (a, b) -> a));
        List<Long> employeeIds = new ArrayList<>(employeesById.keySet());

        BusinessRuleConfig config = requireConfig();
        BigDecimal standardHours = config.getWorkingHoursPerDay();

        Set<LocalDate> holidayDates = holidayRepository.findAllByOrderByHolidayDateAsc().stream()
                .map(Holiday::getHolidayDate)
                .filter(d -> !d.isBefore(from) && !d.isAfter(to))
                .collect(Collectors.toSet());

        // Approved full-day leave per employee — the per-employee counterpart to holidayDates,
        // so one employee's approved leave never zeroes another's available hours.
        Map<Long, Set<LocalDate>> leaveDatesByEmployee = new HashMap<>();
        for (EodEntry entry : eodEntryRepository.findByEmployeeIdInAndEntryDateBetween(employeeIds, from, to)) {
            if (entry.getDayType() == EodEntry.DayType.LEAVE && entry.getStatus() == EodEntry.Status.APPROVED) {
                leaveDatesByEmployee.computeIfAbsent(entry.getEmployee().getId(), k -> new HashSet<>())
                        .add(entry.getEntryDate());
            }
        }

        // Each employee's total available hours across the FULL requested range — the capacity
        // denominator for that employee's rows, computed once regardless of how many of the PM's
        // projects they're allocated to.
        Map<Long, BigDecimal> employeeAvailableHours = new HashMap<>();
        for (Long empId : employeeIds) {
            employeeAvailableHours.put(empId, availableHoursInRange(
                    from, to, holidayDates, leaveDatesByEmployee.getOrDefault(empId, Set.of()), standardHours));
        }

        // Planned hours per (employee, project): available hours restricted to the overlap of
        // each allocation's own effective window and the requested range — an allocation that
        // started mid-range is not credited planned hours for days before it began. An employee
        // holding two concurrent full-time allocations (nothing in the schema forbids allocating
        // the same employee to two different projects over overlapping dates — only the SAME
        // project is guarded against, by V54) legitimately accumulates planned hours toward both;
        // that reflects the current allocation model exactly as ProjectDashboardService already
        // does, not a bug in this calculation.
        Map<String, BigDecimal> plannedByEmpProj = new HashMap<>();
        Map<Long, BigDecimal> plannedByProject = new HashMap<>();
        Map<Long, Set<Long>> employeesByProject = new HashMap<>();
        for (Allocation a : allocations) {
            LocalDate winFrom = maxDate(from, a.getEffectiveFrom());
            LocalDate winTo = a.getEffectiveTo() != null ? minDate(to, a.getEffectiveTo()) : to;
            if (winTo.isBefore(winFrom)) continue;

            Long empId = a.getEmployee().getId();
            Long projId = a.getProject().getId();
            BigDecimal windowAvailable = availableHoursInRange(
                    winFrom, winTo, holidayDates, leaveDatesByEmployee.getOrDefault(empId, Set.of()), standardHours);
            // Planned Hours = Available Working Hours x Allocation % (PRD formula), applied over
            // the allocation's own effective window rather than the full requested range.
            BigDecimal planned = windowAvailable
                    .multiply(BigDecimal.valueOf(a.getAllocationPct()))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);

            plannedByEmpProj.merge(empId + ":" + projId, planned, BigDecimal::add);
            plannedByProject.merge(projId, planned, BigDecimal::add);
            employeesByProject.computeIfAbsent(projId, k -> new HashSet<>()).add(empId);
        }

        Map<String, BigDecimal> actualByEmpProj = eodTaskRepository
                .sumProductiveHoursByEmployeeAndProject(projectIds, employeeIds, from, to).stream()
                .collect(Collectors.toMap(r -> r.employeeId() + ":" + r.projectId(), EmployeeProjectHoursRow::hours));
        Map<Long, BigDecimal> actualByProject = eodTaskRepository
                .sumProductiveHoursByProject(projectIds, employeeIds, from, to).stream()
                .collect(Collectors.toMap(ProjectHoursRow::projectId, ProjectHoursRow::hours));

        // ── Resource rows: one per (employee, project) pair with planned and/or actual hours ──
        Set<String> resourceKeys = new TreeSet<>();
        resourceKeys.addAll(plannedByEmpProj.keySet());
        resourceKeys.addAll(actualByEmpProj.keySet());

        List<PlannedVsActualResourceRowDto> resourceRows = new ArrayList<>();
        for (String key : resourceKeys) {
            String[] parts = key.split(":");
            Long empId = Long.valueOf(parts[0]);
            Long projId = Long.valueOf(parts[1]);
            AppUser emp = employeesById.get(empId);
            Project proj = projectsById.get(projId);
            if (emp == null || proj == null) continue;

            BigDecimal planned = plannedByEmpProj.getOrDefault(key, BigDecimal.ZERO);
            BigDecimal actual = actualByEmpProj.getOrDefault(key, BigDecimal.ZERO);
            BigDecimal available = employeeAvailableHours.getOrDefault(empId, BigDecimal.ZERO);
            BigDecimal plannedPct = pctOf(planned, available);
            BigDecimal actualPct = pctOf(actual, available);

            resourceRows.add(new PlannedVsActualResourceRowDto(
                    empId, emp.getFullName(), projId, proj.getName(),
                    planned, actual, plannedPct, actualPct,
                    actual.subtract(planned), actualPct.subtract(plannedPct),
                    status(actual, planned)));
        }
        resourceRows.sort(Comparator.comparing(PlannedVsActualResourceRowDto::employeeName)
                .thenComparing(PlannedVsActualResourceRowDto::projectName));

        // ── Project rows ─────────────────────────────────────────────────────────────────────
        List<PlannedVsActualProjectRowDto> projectRows = projectIds.stream()
                .filter(pid -> plannedByProject.containsKey(pid) || actualByProject.containsKey(pid))
                .map(pid -> {
                    Project p = projectsById.get(pid);
                    BigDecimal planned = plannedByProject.getOrDefault(pid, BigDecimal.ZERO);
                    BigDecimal actual = actualByProject.getOrDefault(pid, BigDecimal.ZERO);
                    BigDecimal available = employeesByProject.getOrDefault(pid, Set.of()).stream()
                            .map(empId -> employeeAvailableHours.getOrDefault(empId, BigDecimal.ZERO))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal plannedPct = pctOf(planned, available);
                    BigDecimal actualPct = pctOf(actual, available);
                    return new PlannedVsActualProjectRowDto(
                            pid, p.getName(), planned, actual, plannedPct, actualPct,
                            actual.subtract(planned), actualPct.subtract(plannedPct));
                })
                .sorted(Comparator.comparing(PlannedVsActualProjectRowDto::projectName))
                .toList();

        // ── Summary cards — aggregated from totals, never averaged per-row ──────────────────
        BigDecimal totalPlannedHours = plannedByEmpProj.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalActualHours = actualByEmpProj.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalAvailableHours = employeeAvailableHours.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal plannedPct = pctOf(totalPlannedHours, totalAvailableHours);
        BigDecimal actualPct = pctOf(totalActualHours, totalAvailableHours);

        PlannedVsActualCardsDto cards = new PlannedVsActualCardsDto(
                totalPlannedHours, totalActualHours, plannedPct, actualPct,
                totalActualHours.subtract(totalPlannedHours), actualPct.subtract(plannedPct),
                projectRows.size(), employeeIds.size());

        return new PlannedVsActualSummaryDto(cards, projectRows, resourceRows);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static String status(BigDecimal actual, BigDecimal planned) {
        int cmp = actual.subtract(planned).abs().compareTo(HOURS_EPSILON);
        if (cmp <= 0) return "ON_PLAN";
        return actual.compareTo(planned) > 0 ? "ABOVE_PLAN" : "BELOW_PLAN";
    }

    /** Sums per-day available hours (weekend/holiday/approved-full-day-leave-aware) over [rangeFrom, rangeTo]. */
    private static BigDecimal availableHoursInRange(LocalDate rangeFrom, LocalDate rangeTo,
                                                      Set<LocalDate> holidayDates, Set<LocalDate> leaveDates,
                                                      BigDecimal standardHours) {
        BigDecimal total = BigDecimal.ZERO;
        for (LocalDate d = rangeFrom; !d.isAfter(rangeTo); d = d.plusDays(1)) {
            total = total.add(UtilizationCalculator.computeAvailableHours(
                    d, holidayDates.contains(d), leaveDates.contains(d), standardHours));
        }
        return total;
    }

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
        return projectRepository.findByProjectManagerIdOrderByNameAsc(pm.getId());
    }

    private BusinessRuleConfig requireConfig() {
        return configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Business rule configuration missing"));
    }

    private static LocalDate maxDate(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    private static LocalDate minDate(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }

    /** Null-safe percentage; a zero denominator reads as 0% (empty scope is "nothing to report"). */
    private static BigDecimal pctOf(BigDecimal numerator, BigDecimal denominator) {
        if (denominator == null || denominator.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return numerator.divide(denominator, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static PlannedVsActualSummaryDto emptySummary(int projectCount) {
        PlannedVsActualCardsDto cards = new PlannedVsActualCardsDto(
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, projectCount, 0);
        return new PlannedVsActualSummaryDto(cards, List.of(), List.of());
    }
}
