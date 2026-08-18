package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.businessrules.ShiftSchedule;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.org.Designation;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.reports.dto.EodByEmployeeEntryDto;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Backs the PM-facing Reports Dashboard's "EOD by employee" tab: every EOD entry for the
 * employees allocated to a Project Manager's own projects, in a given date range. Scoping
 * mirrors ProjectDashboardService exactly (project.pm.id == caller.id, employee universe
 * derived from Allocation) since both features share the same "what can this PM see" rule.
 */
@Service
@Transactional(readOnly = true)
public class EodByEmployeeReportService {

    /**
     * Sentinel for the report's "W/O Client" option — projects that genuinely have no client,
     * i.e. internal work. A blank/absent client already means "no filter", so it cannot express
     * this. Mirrored as NO_CLIENT in the report screen.
     */
    static final String NO_CLIENT = "__NONE__";

    private final AppUserRepository appUserRepository;
    private final ProjectRepository projectRepository;
    private final AllocationRepository allocationRepository;
    private final EodEntryRepository eodEntryRepository;
    private final DesignationRepository designationRepository;
    private final ShiftDefinitionRepository shiftRepository;

    public EodByEmployeeReportService(AppUserRepository appUserRepository,
                                       ProjectRepository projectRepository,
                                       AllocationRepository allocationRepository,
                                       EodEntryRepository eodEntryRepository,
                                       DesignationRepository designationRepository,
                                       ShiftDefinitionRepository shiftRepository) {
        this.appUserRepository = appUserRepository;
        this.projectRepository = projectRepository;
        this.allocationRepository = allocationRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.designationRepository = designationRepository;
        this.shiftRepository = shiftRepository;
    }

    public EodByEmployeeReportDto getReport(String actingEmail, LocalDate from, LocalDate to,
                                             Long projectId, String client, Long teamManagerId,
                                             String status, String billable, String employeeQuery) {
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
        if (NO_CLIENT.equals(client)) {
            // "W/O Client": internal work, where the project type never captures a client name.
            projects = projects.stream()
                    .filter(p -> p.getClient() == null || p.getClient().isBlank())
                    .toList();
        } else if (client != null && !client.isBlank()) {
            projects = projects.stream().filter(p -> client.equals(p.getClient())).toList();
        }

        List<Long> projectIds = projects.stream().map(Project::getId).toList();
        if (projectIds.isEmpty()) {
            return new EodByEmployeeReportDto(0, 0, BigDecimal.ZERO, List.of());
        }

        List<Allocation> allocations = allocationRepository.findActiveInRangeForProjects(projectIds, from, to);
        if (teamManagerId != null) {
            allocations = allocations.stream()
                    .filter(a -> a.getEmployee().getManager() != null
                            && a.getEmployee().getManager().getId().equals(teamManagerId))
                    .toList();
        }

        Map<Long, AppUser> employeesById = allocations.stream()
                .map(Allocation::getEmployee)
                .collect(Collectors.toMap(AppUser::getId, e -> e, (a, b) -> a));

        if (employeeQuery != null && !employeeQuery.isBlank()) {
            String q = employeeQuery.trim().toLowerCase();
            employeesById = employeesById.values().stream()
                    .filter(e -> e.getFullName().toLowerCase().contains(q)
                            || (e.getEmployeeCode() != null && e.getEmployeeCode().toLowerCase().contains(q)))
                    .collect(Collectors.toMap(AppUser::getId, e -> e));
        }
        if (employeesById.isEmpty()) {
            return new EodByEmployeeReportDto(0, 0, BigDecimal.ZERO, List.of());
        }

        // First allocated project per employee (by name) — mirrors ProjectDashboardService's
        // primary-project convention when an employee is split across several of the PM's projects.
        Map<Long, Project> primaryProjectByEmployee = new HashMap<>();
        Map<Long, java.util.Set<String>> projectCodesByEmployee = new HashMap<>();
        for (Allocation a : allocations) {
            Long empId = a.getEmployee().getId();
            if (!employeesById.containsKey(empId)) continue;
            primaryProjectByEmployee.merge(empId, a.getProject(),
                    (existing, candidate) -> existing.getName().compareTo(candidate.getName()) <= 0 ? existing : candidate);
            projectCodesByEmployee.computeIfAbsent(empId, k -> new java.util.TreeSet<>()).add(a.getProject().getCode());
        }

        List<Long> employeeIds = new ArrayList<>(employeesById.keySet());
        List<EodEntry> entries = eodEntryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(employeeIds, from, to);
        Map<Long, List<EodEntry>> entriesByEmployee = entries.stream()
                .collect(Collectors.groupingBy(e -> e.getEmployee().getId()));

        Map<Long, ShiftDefinition> shiftsById = shiftRepository.findAll().stream()
                .collect(Collectors.toMap(ShiftDefinition::getId, s -> s));

        Map<Long, Designation> designationsById = new HashMap<>();

        List<EodByEmployeeRowDto> rows = new ArrayList<>();
        int totalEntryCount = 0;
        BigDecimal totalHoursAll = BigDecimal.ZERO;

        for (Long empId : employeeIds) {
            AppUser emp = employeesById.get(empId);
            List<EodEntry> empEntries = entriesByEmployee.getOrDefault(empId, List.of());

            List<EodByEmployeeEntryDto> entryDtos = new ArrayList<>();
            BigDecimal totalHours = BigDecimal.ZERO;
            BigDecimal billableHours = BigDecimal.ZERO;
            boolean anyLate = false;
            for (EodEntry entry : empEntries) {
                boolean lateEntry = isLate(entry, shiftOf(emp, shiftsById));
                if (lateEntry) anyLate = true;

                // Hours/entries only count once a Team Lead/Manager has actually approved them —
                // a DRAFT/pending/rejected entry isn't real, reportable data yet. Submission
                // timing (anyLate, above) is judged independently of approval, so it still covers
                // every entry regardless of status.
                if (entry.getStatus() != EodEntry.Status.APPROVED) continue;

                for (EodTask task : entry.getTasks()) {
                    BigDecimal hours = task.getHours() != null ? task.getHours() : BigDecimal.ZERO;
                    totalHours = totalHours.add(hours);
                    boolean taskBillable = Boolean.TRUE.equals(task.getIsBillable());
                    if (taskBillable) billableHours = billableHours.add(hours);
                    entryDtos.add(new EodByEmployeeEntryDto(
                            entry.getId(), entry.getEntryDate(),
                            task.getProject() != null ? task.getProject().getCode() : null,
                            task.getTaskCategory() != null ? task.getTaskCategory().getName() : null,
                            hours, taskBillable));
                }
            }

            String empStatus = empEntries.isEmpty() ? "MISSING" : anyLate ? "LATE" : "SUBMITTED";
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(empStatus)) continue;

            boolean hasBillableTask = entryDtos.stream().anyMatch(EodByEmployeeEntryDto::billable);
            boolean hasInternalTask = entryDtos.stream().anyMatch(e -> !e.billable());
            if (billable != null && !billable.isBlank()) {
                boolean wantsBillable = billable.equalsIgnoreCase("BILLABLE");
                boolean matches = wantsBillable ? hasBillableTask : hasInternalTask;
                if (!matches) continue;
            }

            Designation designation = null;
            if (emp.getDesignationId() != null) {
                designation = designationsById.computeIfAbsent(emp.getDesignationId(),
                        id -> designationRepository.findById(id).orElse(null));
            }

            Project primaryProject = primaryProjectByEmployee.get(empId);
            List<String> projectCodes = projectCodesByEmployee.getOrDefault(empId, java.util.Set.of())
                    .stream().sorted().toList();

            entryDtos.sort(Comparator.comparing(EodByEmployeeEntryDto::date).reversed());

            rows.add(new EodByEmployeeRowDto(
                    empId, emp.getFullName(), emp.getEmployeeCode(),
                    designation != null ? designation.getTitle() : null,
                    projectCodes,
                    primaryProject != null ? primaryProject.getClient() : null,
                    emp.getManager() != null ? emp.getManager().getFullName() : null,
                    empStatus, entryDtos.size(), totalHours, billableHours, entryDtos));

            totalEntryCount += entryDtos.size();
            totalHoursAll = totalHoursAll.add(totalHours);
        }

        rows.sort(Comparator.comparing(EodByEmployeeRowDto::employeeName));

        return new EodByEmployeeReportDto(rows.size(), totalEntryCount, totalHoursAll, rows);
    }

    /** The employee's shift, or null when unassigned or the shift no longer exists. */
    private ShiftDefinition shiftOf(AppUser employee, Map<Long, ShiftDefinition> shiftsById) {
        return employee.getShiftId() == null ? null : shiftsById.get(employee.getShiftId());
    }

    /**
     * Late means submitted after that shift's deadline — {@code shift end + eod_cutoff_hours}.
     *
     * <p>Previously this compared the submission's bare time-of-day against a global cutoff and
     * treated any submission dated after the work date as late, which flagged every correct
     * submission on a shift ending after midnight. Anchoring to the shift's own cutoff instant
     * makes a 00:30 submission for the previous day's Evening shift simply on time.
     *
     * <p>Not flagged at all when there is no shift or no cutoff configured — there is no deadline
     * to have missed.
     */
    private boolean isLate(EodEntry entry, ShiftDefinition shift) {
        if (entry.getSubmittedAt() == null || shift == null) return false;
        LocalDateTime cutoffAt = ShiftSchedule.cutoffAt(shift, entry.getEntryDate());
        if (cutoffAt == null) return false;
        return entry.getSubmittedAt().toLocalDateTime().isAfter(cutoffAt);
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
}
