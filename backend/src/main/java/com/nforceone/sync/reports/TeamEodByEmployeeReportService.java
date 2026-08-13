package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.org.Designation;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
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
import java.time.LocalTime;
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

    private static final long CONFIG_ID = 1L;

    private final AppUserRepository appUserRepository;
    private final AllocationRepository allocationRepository;
    private final EodEntryRepository eodEntryRepository;
    private final DesignationRepository designationRepository;
    private final BusinessRuleConfigRepository configRepository;

    public TeamEodByEmployeeReportService(AppUserRepository appUserRepository,
                                           AllocationRepository allocationRepository,
                                           EodEntryRepository eodEntryRepository,
                                           DesignationRepository designationRepository,
                                           BusinessRuleConfigRepository configRepository) {
        this.appUserRepository = appUserRepository;
        this.allocationRepository = allocationRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.designationRepository = designationRepository;
        this.configRepository = configRepository;
    }

    public TeamReportFiltersDto getFilters(String actingEmail) {
        AppUser lead = requireManager(actingEmail);
        List<AppUser> teamMembers = getTeamMembers(lead);
        if (teamMembers.isEmpty()) {
            return new TeamReportFiltersDto(List.of(), List.of());
        }
        List<Long> employeeIds = teamMembers.stream().map(AppUser::getId).toList();
        List<Allocation> allocations = allocationRepository.findByEmployeeIdIn(employeeIds);

        List<ProjectOptionDto> projects = allocations.stream()
                .map(Allocation::getProject)
                .collect(Collectors.toMap(Project::getId, p -> p, (a, b) -> a))
                .values().stream()
                .sorted(Comparator.comparing(Project::getName))
                .map(p -> new ProjectOptionDto(p.getId(), p.getName()))
                .toList();

        List<String> clients = allocations.stream()
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
            if (client != null && !client.isBlank()) {
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

        LocalTime cutoffTime = configRepository.findById(CONFIG_ID)
                .map(BusinessRuleConfig::getEodCutoffTime)
                .orElse(LocalTime.of(19, 0));

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
                boolean lateEntry = isLate(entry, cutoffTime);
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

    private boolean isLate(EodEntry entry, LocalTime cutoffTime) {
        if (entry.getSubmittedAt() == null) return false;
        LocalDate submittedDate = entry.getSubmittedAt().toLocalDate();
        if (submittedDate.isAfter(entry.getEntryDate())) return true;
        if (submittedDate.isBefore(entry.getEntryDate())) return false;
        return entry.getSubmittedAt().toLocalTime().isAfter(cutoffTime);
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
