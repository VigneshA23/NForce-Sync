package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.businessrules.ShiftSchedule;
import com.nforceone.sync.eod.EodAccessPolicy;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLine;
import com.nforceone.sync.eod.EodLogLineRepository;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Backs My Reporting Team > Reports: the "EOD by employee" report for the caller's direct reports, in the
 * same response shape as the PM and Team Lead reports so the screen can share its types and export.
 *
 * <p><b>Which entries.</b> Only entries whose frozen reporting-manager snapshot ({@code eod_entry.manager_id},
 * set at submission) is the caller. History therefore stays with whoever managed the employee when they
 * submitted, and after a reassignment new entries go to the new manager while old ones stay with the old one.
 *
 * <p><b>Which employees (the roster).</b> The caller's current ACTIVE direct reports — shown even with no entries,
 * so the Avg hrs denominator is the team size — plus anyone with snapshot entries under the caller in the range
 * (a former report). A former report with nothing to show in the range is never listed as an empty row.
 *
 * <p>The caller sees the whole day of his report, not a project-scoped slice (as {@code EodAccessPolicy} grants a
 * frozen reporting manager). Who may call and who is in the roster is decided by {@link EodAccessPolicy}; the
 * frontend never decides it.
 */
@Service
@Transactional(readOnly = true)
public class RmEodByEmployeeReportService {

    private final AppUserRepository appUserRepository;
    private final AllocationRepository allocationRepository;
    private final EodEntryRepository eodEntryRepository;
    private final EodLogLineRepository logLineRepository;
    private final DesignationRepository designationRepository;
    private final ShiftDefinitionRepository shiftRepository;
    private final EodAccessPolicy accessPolicy;
    private final BusinessClock businessClock;

    public RmEodByEmployeeReportService(AppUserRepository appUserRepository,
                                        AllocationRepository allocationRepository,
                                        EodEntryRepository eodEntryRepository,
                                        EodLogLineRepository logLineRepository,
                                        DesignationRepository designationRepository,
                                        ShiftDefinitionRepository shiftRepository,
                                        EodAccessPolicy accessPolicy,
                                        BusinessClock businessClock) {
        this.businessClock = businessClock;
        this.appUserRepository = appUserRepository;
        this.allocationRepository = allocationRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.logLineRepository = logLineRepository;
        this.designationRepository = designationRepository;
        this.shiftRepository = shiftRepository;
        this.accessPolicy = accessPolicy;
    }

    /** Projects and clients the caller's current direct reports are allocated to — the report's two dropdowns. */
    public TeamReportFiltersDto getFilters(String actingEmail) {
        AppUser actor = requireReportingManager(actingEmail);
        List<Long> roster = new ArrayList<>(accessPolicy.reportingTeamReportRoster(actor, List.of()));
        if (roster.isEmpty()) return new TeamReportFiltersDto(List.of(), List.of());

        List<Allocation> allocations = allocationRepository.findByEmployeeIdIn(roster);
        Map<Long, ProjectOptionDto> projects = new TreeMap<>();
        TreeSet<String> clients = new TreeSet<>();
        for (Allocation a : allocations) {
            Project p = a.getProject();
            projects.putIfAbsent(p.getId(), new ProjectOptionDto(p.getId(), p.getName(), p.getClient()));
            if (p.getClient() != null && !p.getClient().isBlank()) clients.add(p.getClient());
        }
        List<ProjectOptionDto> sorted = projects.values().stream()
                .sorted(Comparator.comparing(ProjectOptionDto::name, String.CASE_INSENSITIVE_ORDER)).toList();
        return new TeamReportFiltersDto(sorted, List.copyOf(clients));
    }

    public EodByEmployeeReportDto getReport(String actingEmail, LocalDate from, LocalDate to,
                                            Long employeeId, Long projectId, String client,
                                            String status, String employeeQuery) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' cannot be before 'from'");
        }
        AppUser actor = requireReportingManager(actingEmail);

        // Entries first: they decide which former reports belong in the roster.
        List<EodEntry> snapshotEntries = eodEntryRepository
                .findWithTasksByManagerIdAndEntryDateBetween(actor.getId(), from, to).stream()
                .filter(e -> !e.getEmployee().getId().equals(actor.getId()))
                .toList();
        Set<Long> snapshotEmployeeIds = snapshotEntries.stream()
                .map(e -> e.getEmployee().getId()).collect(Collectors.toSet());
        Set<Long> roster = accessPolicy.reportingTeamReportRoster(actor, snapshotEmployeeIds);

        // The backend, not the screen, decides who may be asked for.
        if (employeeId != null && !roster.contains(employeeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied: this employee is not in your reporting team");
        }

        Map<Long, AppUser> employeesById = new LinkedHashMap<>();
        for (AppUser u : appUserRepository.findAllById(roster)) employeesById.put(u.getId(), u);
        if (employeeId != null) employeesById.keySet().removeIf(id -> !id.equals(employeeId));

        if (employeeQuery != null && !employeeQuery.isBlank()) {
            String q = employeeQuery.trim().toLowerCase();
            employeesById.values().removeIf(e -> !(e.getFullName().toLowerCase().contains(q)
                    || (e.getEmployeeCode() != null && e.getEmployeeCode().toLowerCase().contains(q))));
        }
        if (employeesById.isEmpty()) return empty();

        // Project / client filter: keep employees allocated to a matching project in the range.
        if (projectId != null || (client != null && !client.isBlank())) {
            List<Allocation> allocations = allocationRepository
                    .findActiveInRangeForEmployees(new ArrayList<>(employeesById.keySet()), from, to);
            if (projectId != null) {
                allocations = allocations.stream().filter(a -> a.getProject().getId().equals(projectId)).toList();
            }
            if (EodByEmployeeReportService.NO_CLIENT.equals(client)) {
                allocations = allocations.stream()
                        .filter(a -> a.getProject().getClient() == null || a.getProject().getClient().isBlank())
                        .toList();
            } else if (client != null && !client.isBlank()) {
                allocations = allocations.stream().filter(a -> client.equals(a.getProject().getClient())).toList();
            }
            Set<Long> eligible = allocations.stream().map(a -> a.getEmployee().getId()).collect(Collectors.toSet());
            employeesById.keySet().removeIf(id -> !eligible.contains(id));
            if (employeesById.isEmpty()) return empty();
        }

        List<Long> employeeIds = new ArrayList<>(employeesById.keySet());

        // Project codes / primary project for display only.
        Map<Long, Project> primaryProjectByEmployee = new HashMap<>();
        Map<Long, Set<String>> projectCodesByEmployee = new HashMap<>();
        for (Allocation a : allocationRepository.findActiveInRangeForEmployees(employeeIds, from, to)) {
            Long empId = a.getEmployee().getId();
            primaryProjectByEmployee.merge(empId, a.getProject(),
                    (existing, candidate) -> existing.getName().compareTo(candidate.getName()) <= 0 ? existing : candidate);
            projectCodesByEmployee.computeIfAbsent(empId, k -> new TreeSet<>()).add(a.getProject().getCode());
        }

        Map<Long, List<EodEntry>> entriesByEmployee = snapshotEntries.stream()
                .filter(e -> employeesById.containsKey(e.getEmployee().getId()))
                .collect(Collectors.groupingBy(e -> e.getEmployee().getId()));
        Map<Long, ShiftDefinition> shiftsById = shiftRepository.findAll().stream()
                .collect(Collectors.toMap(ShiftDefinition::getId, s -> s));
        Map<Long, Designation> designationsById = new HashMap<>();
        Set<Long> activeIds = Set.copyOf(accessPolicy.reportingTeamReportRoster(actor, Set.of()));

        // Daily Log (PLAIN_LOG) entries carry log lines, not tasks — load them in one query for the approved ones.
        List<Long> plainLogEntryIds = snapshotEntries.stream()
                .filter(e -> e.getStatus() == EodEntry.Status.APPROVED
                        && e.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG
                        && employeesById.containsKey(e.getEmployee().getId()))
                .map(EodEntry::getId).toList();
        Map<Long, List<EodLogLine>> logLinesByEntry = plainLogEntryIds.isEmpty() ? Map.of()
                : logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(plainLogEntryIds).stream()
                        .collect(Collectors.groupingBy(l -> l.getEntry().getId()));

        List<EodByEmployeeRowDto> rows = new ArrayList<>();
        int totalEntryCount = 0;
        BigDecimal totalHoursAll = BigDecimal.ZERO;

        for (Long empId : employeeIds) {
            AppUser emp = employeesById.get(empId);
            List<EodEntry> empEntries = entriesByEmployee.getOrDefault(empId, List.of());

            List<EodByEmployeeEntryDto> entryDtos = new ArrayList<>();
            BigDecimal totalHours = BigDecimal.ZERO;
            boolean anyLate = false;
            for (EodEntry entry : empEntries) {
                if (isLate(entry, emp.getShiftId() == null ? null : shiftsById.get(emp.getShiftId()))) anyLate = true;
                // Same rule as the PM and Lead reports: only approved days count towards hours and entries.
                if (entry.getStatus() != EodEntry.Status.APPROVED) continue;
                if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
                    // One row per log line: Bench/Daily Log category, no project, hours counted in the totals.
                    String dayType = entry.getDayType() != null ? entry.getDayType().name() : null;
                    // Same per-day repetition the task rows carry: the report prints it once, on the day's first row.
                    String adjType = entry.getTimeAdjustmentType() != null ? entry.getTimeAdjustmentType().name() : null;
                    Integer adjMinutes = entry.getTimeAdjustmentMinutes();
                    List<EodLogLine> lines = logLinesByEntry.getOrDefault(entry.getId(), List.of());
                    if (lines.isEmpty()) {
                        // Pre-V110 entry: a single total, no lines.
                        BigDecimal legacy = entry.getLogTotalHours();
                        if (legacy != null && legacy.signum() > 0) {
                            totalHours = totalHours.add(legacy);
                            entryDtos.add(new EodByEmployeeEntryDto(entry.getId(), entry.getEntryDate(),
                                    null, null, legacy, adjType, adjMinutes, dayType));
                        }
                    }
                    for (EodLogLine line : lines) {
                        BigDecimal hours = line.getHours() != null ? line.getHours() : BigDecimal.ZERO;
                        totalHours = totalHours.add(hours);
                        entryDtos.add(new EodByEmployeeEntryDto(entry.getId(), entry.getEntryDate(),
                                null, line.getCategory() != null ? line.getCategory().getName() : null,
                                hours, adjType, adjMinutes, dayType));
                    }
                    continue;
                }
                for (EodTask task : entry.getTasks()) {
                    BigDecimal hours = task.getHours() != null ? task.getHours() : BigDecimal.ZERO;
                    totalHours = totalHours.add(hours);
                    entryDtos.add(new EodByEmployeeEntryDto(
                            entry.getId(), entry.getEntryDate(),
                            task.getProject() != null ? task.getProject().getCode() : null,
                            task.getTaskCategory() != null ? task.getTaskCategory().getName() : null,
                            hours,
                            entry.getTimeAdjustmentType() != null ? entry.getTimeAdjustmentType().name() : null,
                            entry.getTimeAdjustmentMinutes(),
                            entry.getDayType() != null ? entry.getDayType().name() : null));
                }
            }

            // A former report is only here because of entries under this manager; with nothing to show in
            // the range he is left out rather than listed as an empty row.
            if (!activeIds.contains(empId) && entryDtos.isEmpty()) continue;

            String empStatus = empEntries.isEmpty() ? "MISSING" : anyLate ? "LATE" : "SUBMITTED";
            if (status != null && !status.isBlank() && !status.equalsIgnoreCase(empStatus)) continue;

            Designation designation = null;
            if (emp.getDesignationId() != null) {
                designation = designationsById.computeIfAbsent(emp.getDesignationId(),
                        id -> designationRepository.findById(id).orElse(null));
            }
            Project primaryProject = primaryProjectByEmployee.get(empId);
            List<String> projectCodes = projectCodesByEmployee.getOrDefault(empId, Set.of()).stream().sorted().toList();

            entryDtos.sort(Comparator.comparing(EodByEmployeeEntryDto::date).reversed());
            rows.add(new EodByEmployeeRowDto(
                    empId, emp.getFullName(), emp.getEmployeeCode(),
                    designation != null ? designation.getTitle() : null,
                    projectCodes,
                    primaryProject != null ? primaryProject.getClient() : null,
                    emp.getManager() != null ? emp.getManager().getFullName() : null,
                    empStatus, entryDtos.size(), totalHours, entryDtos));
            totalEntryCount += entryDtos.size();
            totalHoursAll = totalHoursAll.add(totalHours);
        }

        rows.sort(Comparator.comparing(EodByEmployeeRowDto::employeeName));
        return new EodByEmployeeReportDto(rows.size(), totalEntryCount, totalHoursAll, rows);
    }

    private static EodByEmployeeReportDto empty() {
        return new EodByEmployeeReportDto(0, 0, BigDecimal.ZERO, List.of());
    }

    /** Late = submitted after the employee's shift deadline; same rule as the PM and Lead reports. */
    private boolean isLate(EodEntry entry, ShiftDefinition shift) {
        return ShiftSchedule.isSubmittedLate(shift, entry.getEntryDate(), entry.getSubmittedAt(), businessClock.zone());
    }

    private AppUser requireReportingManager(String actingEmail) {
        AppUser user = appUserRepository.findByEmailAndDeletedAtIsNull(actingEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
        if (!accessPolicy.mayViewReportingTeamReports(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Access denied: no direct reports assigned to this account");
        }
        return user;
    }
}
