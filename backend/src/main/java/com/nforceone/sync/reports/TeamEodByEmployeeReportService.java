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
import com.nforceone.sync.projectdashboard.dto.ProjectOptionDto;
import com.nforceone.sync.reports.dto.EodByEmployeeEntryDto;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import com.nforceone.sync.reports.dto.TeamReportFiltersDto;
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
 * Backs the Team Lead Reports "EOD by employee" tab, scoped to the lead's direct reports
 * (AppUser.manager_id FK) instead of PM project allocations. Every calculation is identical
 * to EodByEmployeeReportService — only the employee universe differs.
 */
@Service
@Transactional(readOnly = true)
public class TeamEodByEmployeeReportService {

    private final AppUserRepository appUserRepository;
    private final AllocationRepository allocationRepository;
    private final EodEntryRepository eodEntryRepository;
    private final DesignationRepository designationRepository;
    private final ShiftDefinitionRepository shiftRepository;
    private final ProjectRepository projectRepository;

    public TeamEodByEmployeeReportService(AppUserRepository appUserRepository,
                                           AllocationRepository allocationRepository,
                                           EodEntryRepository eodEntryRepository,
                                           DesignationRepository designationRepository,
                                           ShiftDefinitionRepository shiftRepository,
                                           ProjectRepository projectRepository) {
        this.appUserRepository = appUserRepository;
        this.allocationRepository = allocationRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.designationRepository = designationRepository;
        this.shiftRepository = shiftRepository;
        this.projectRepository = projectRepository;
    }

    public TeamReportFiltersDto getFilters(String actingEmail) {
        AppUser lead = requireManager(actingEmail);

        // Project options: the projects actually assigned to this Team Lead — Project.pm, the
        // same source of truth as "My Projects" (TeamLeadProjectService.listMyProjects) — NOT
        // derived from the team's own allocations, which reflects which projects the lead's
        // direct reports happen to work on rather than which projects this lead is the Team
        // Lead of. Those are two different relationships and can legitimately diverge.
        List<ProjectOptionDto> projects = projectRepository.findByPmIdOrderByNameAsc(lead.getId())
                .stream()
                .map(p -> new ProjectOptionDto(p.getId(), p.getName()))
                .toList();

        // The Client filter is unaffected by this fix — it stays scoped to what the team's own
        // allocations reference, matching how getReport() itself derives client-eligible rows.
        List<AppUser> teamMembers = getTeamMembers(lead);
        List<String> clients = teamMembers.isEmpty() ? List.of() : allocationRepository
                .findByEmployeeIdIn(teamMembers.stream().map(AppUser::getId).toList())
                .stream()
                .map(a -> a.getProject().getClient())
                .filter(c -> c != null && !c.isBlank())
                .distinct()
                .sorted()
                .toList();

        return new TeamReportFiltersDto(projects, clients);
    }

    public EodByEmployeeReportDto getReport(String actingEmail, LocalDate from, LocalDate to,
                                             Long projectId, String client,
                                             String status, String billable, String employeeQuery) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' cannot be before 'from'");
        }

        AppUser lead = requireManager(actingEmail);
        List<AppUser> teamMembers = getTeamMembers(lead);

        if (teamMembers.isEmpty()) {
            return new EodByEmployeeReportDto(0, 0, BigDecimal.ZERO, List.of());
        }

        List<Long> allEmployeeIds = teamMembers.stream().map(AppUser::getId).toList();

        // Optional project/client filter: derive eligible employees via allocations
        List<Long> employeeIds;
        if (projectId != null || (client != null && !client.isBlank())) {
            List<Allocation> allocations = allocationRepository.findActiveInRangeForEmployees(allEmployeeIds, from, to);
            if (projectId != null) {
                allocations = allocations.stream()
                        .filter(a -> a.getProject().getId().equals(projectId))
                        .toList();
            }
            if (EodByEmployeeReportService.NO_CLIENT.equals(client)) {
                // "W/O Client": internal work, where the project type never captures a client name.
                allocations = allocations.stream()
                        .filter(a -> a.getProject().getClient() == null
                                  || a.getProject().getClient().isBlank())
                        .toList();
            } else if (client != null && !client.isBlank()) {
                allocations = allocations.stream()
                        .filter(a -> client.equals(a.getProject().getClient()))
                        .toList();
            }
            employeeIds = allocations.stream()
                    .map(a -> a.getEmployee().getId())
                    .distinct().toList();
        } else {
            employeeIds = allEmployeeIds;
        }

        if (employeeIds.isEmpty()) {
            return new EodByEmployeeReportDto(0, 0, BigDecimal.ZERO, List.of());
        }

        Map<Long, AppUser> employeesById = teamMembers.stream()
                .filter(u -> employeeIds.contains(u.getId()))
                .collect(Collectors.toMap(AppUser::getId, u -> u));

        // Employee search filter
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

        // Resolve primary project and all project codes for each employee (display only)
        List<Long> filteredEmployeeIds = new ArrayList<>(employeesById.keySet());
        List<Allocation> allAllocations = allocationRepository.findActiveInRangeForEmployees(filteredEmployeeIds, from, to);
        Map<Long, Project> primaryProjectByEmployee = new HashMap<>();
        Map<Long, java.util.Set<String>> projectCodesByEmployee = new HashMap<>();
        for (Allocation a : allAllocations) {
            Long empId = a.getEmployee().getId();
            if (!employeesById.containsKey(empId)) continue;
            primaryProjectByEmployee.merge(empId, a.getProject(),
                    (existing, candidate) -> existing.getName().compareTo(candidate.getName()) <= 0 ? existing : candidate);
            projectCodesByEmployee.computeIfAbsent(empId, k -> new java.util.TreeSet<>()).add(a.getProject().getCode());
        }

        List<EodEntry> entries = eodEntryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(filteredEmployeeIds, from, to);
        Map<Long, List<EodEntry>> entriesByEmployee = entries.stream()
                .collect(Collectors.groupingBy(e -> e.getEmployee().getId()));

        Map<Long, ShiftDefinition> shiftsById = shiftRepository.findAll().stream()
                .collect(Collectors.toMap(ShiftDefinition::getId, s -> s));

        Map<Long, Designation> designationsById = new HashMap<>();
        List<EodByEmployeeRowDto> rows = new ArrayList<>();
        int totalEntryCount = 0;
        BigDecimal totalHoursAll = BigDecimal.ZERO;

        for (Long empId : filteredEmployeeIds) {
            AppUser emp = employeesById.get(empId);
            List<EodEntry> empEntries = entriesByEmployee.getOrDefault(empId, List.of());

            List<EodByEmployeeEntryDto> entryDtos = new ArrayList<>();
            BigDecimal totalHours = BigDecimal.ZERO;
            BigDecimal billableHours = BigDecimal.ZERO;
            boolean anyLate = false;

            for (EodEntry entry : empEntries) {
                boolean lateEntry = isLate(entry, shiftOf(emp, shiftsById));
                if (lateEntry) anyLate = true;
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
                if (!(wantsBillable ? hasBillableTask : hasInternalTask)) continue;
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
     * Mirrors {@code EodByEmployeeReportService.isLate} so the PM and Team Lead views of the same
     * entry never disagree about whether it was late.
     *
     * <p>Not flagged when there is no shift or no cutoff configured — no deadline to have missed.
     */
    private boolean isLate(EodEntry entry, ShiftDefinition shift) {
        if (entry.getSubmittedAt() == null || shift == null) return false;
        LocalDateTime cutoffAt = ShiftSchedule.cutoffAt(shift, entry.getEntryDate());
        if (cutoffAt == null) return false;
        return entry.getSubmittedAt().toLocalDateTime().isAfter(cutoffAt);
    }

    private AppUser requireManager(String actingEmail) {
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (user.getRole() != AppUser.Role.MANAGER && user.getRole() != AppUser.Role.SUPERADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Team Lead access required");
        }
        return user;
    }

    private List<AppUser> getTeamMembers(AppUser lead) {
        if (lead.getRole() == AppUser.Role.SUPERADMIN) {
            return appUserRepository.findAll().stream()
                    .filter(u -> u.getStatus() == AppUser.Status.ACTIVE && u.getDeletedAt() == null)
                    .sorted(Comparator.comparing(AppUser::getFullName))
                    .toList();
        }
        return appUserRepository.findByManagerId(lead.getId()).stream()
                .filter(u -> u.getStatus() == AppUser.Status.ACTIVE && u.getDeletedAt() == null)
                .toList();
    }
}
