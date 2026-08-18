package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
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
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.Designation;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.reports.dto.MissingEodDayDto;
import com.nforceone.sync.reports.dto.MissingEodReportDto;
import com.nforceone.sync.reports.dto.MissingEodRowDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Backs the Team Lead Reports "Missing EOD" tab, scoped to the lead's direct reports
 * (AppUser.manager_id FK). Calculation logic is identical to MissingEodReportService;
 * only the employee universe and role check differ.
 */
@Service
@Transactional(readOnly = true)
public class TeamMissingEodReportService {

    private static final long CONFIG_ID = 1L;
    private static final String LEAVE_HOLIDAY_CATEGORY = "Leave / Holiday";

    private final AppUserRepository appUserRepository;
    private final AllocationRepository allocationRepository;
    private final EodEntryRepository eodEntryRepository;
    private final HolidayRepository holidayRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final DesignationRepository designationRepository;
    private final NotificationService notificationService;
    private final ShiftDefinitionRepository shiftRepository;

    public TeamMissingEodReportService(AppUserRepository appUserRepository,
                                        AllocationRepository allocationRepository,
                                        EodEntryRepository eodEntryRepository,
                                        HolidayRepository holidayRepository,
                                        BusinessRuleConfigRepository configRepository,
                                        DesignationRepository designationRepository,
                                        NotificationService notificationService,
                                        ShiftDefinitionRepository shiftRepository) {
        this.appUserRepository = appUserRepository;
        this.allocationRepository = allocationRepository;
        this.eodEntryRepository = eodEntryRepository;
        this.holidayRepository = holidayRepository;
        this.configRepository = configRepository;
        this.notificationService = notificationService;
        this.designationRepository = designationRepository;
        this.shiftRepository = shiftRepository;
    }

    /**
     * Whether {@code date}'s EOD is actually overdue for this employee — see the identical helper
     * in MissingEodReportService. A working day with no entry is not a gap until its deadline
     * (shift end + configured cutoff hours) has passed, so today is not remindable until then.
     */
    private boolean isPastDue(LocalDate date, ShiftDefinition shift, LocalDateTime now) {
        LocalDateTime cutoffAt = shift == null ? null : ShiftSchedule.cutoffAt(shift, date);
        if (cutoffAt == null) return date.isBefore(now.toLocalDate());
        return now.isAfter(cutoffAt);
    }

    public MissingEodReportDto getReport(String actingEmail, LocalDate from, LocalDate to,
                                          Long projectId, String employeeQuery) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' cannot be before 'from'");
        }

        AppUser lead = requireManager(actingEmail);
        List<AppUser> teamMembers = getTeamMembers(lead);
        if (teamMembers.isEmpty()) {
            return new MissingEodReportDto(0, 0, List.of());
        }

        List<Long> allEmployeeIds = teamMembers.stream().map(AppUser::getId).toList();

        // Optional project filter: narrow to team members allocated on that project in range
        List<Long> employeeIds;
        if (projectId != null) {
            List<Allocation> allocations = allocationRepository.findActiveInRangeForEmployees(allEmployeeIds, from, to)
                    .stream().filter(a -> a.getProject().getId().equals(projectId)).toList();
            employeeIds = allocations.stream().map(a -> a.getEmployee().getId()).distinct().toList();
        } else {
            employeeIds = allEmployeeIds;
        }

        if (employeeIds.isEmpty()) {
            return new MissingEodReportDto(0, 0, List.of());
        }

        Map<Long, AppUser> employeesById = teamMembers.stream()
                .filter(u -> employeeIds.contains(u.getId()))
                .collect(Collectors.toMap(AppUser::getId, u -> u));

        if (employeeQuery != null && !employeeQuery.isBlank()) {
            String q = employeeQuery.trim().toLowerCase();
            employeesById = employeesById.values().stream()
                    .filter(e -> e.getFullName().toLowerCase().contains(q)
                            || (e.getEmployeeCode() != null && e.getEmployeeCode().toLowerCase().contains(q)))
                    .collect(Collectors.toMap(AppUser::getId, e -> e));
        }
        if (employeesById.isEmpty()) {
            return new MissingEodReportDto(0, 0, List.of());
        }

        // First allocated project per employee (display only — team's primary project)
        List<Long> filteredEmployeeIds = new ArrayList<>(employeesById.keySet());
        List<Allocation> allAllocations = allocationRepository.findActiveInRangeForEmployees(filteredEmployeeIds, from, to);
        Map<Long, Project> primaryProjectByEmployee = new HashMap<>();
        for (Allocation a : allAllocations) {
            if (!employeesById.containsKey(a.getEmployee().getId())) continue;
            primaryProjectByEmployee.merge(a.getEmployee().getId(), a.getProject(),
                    (existing, candidate) -> existing.getName().compareTo(candidate.getName()) <= 0 ? existing : candidate);
        }

        List<EodEntry> entries = eodEntryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(filteredEmployeeIds, from, to);
        Map<String, EodEntry> entryByEmpDate = entries.stream()
                .collect(Collectors.toMap(e -> e.getEmployee().getId() + ":" + e.getEntryDate(), e -> e));

        Set<LocalDate> holidayDates = holidayRepository.findByHolidayDateBetween(from, to).stream()
                .map(Holiday::getHolidayDate).collect(Collectors.toSet());

        BusinessRuleConfig config = configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Business rule configuration missing"));
        BigDecimal atRiskThresholdPct = config.getAtRiskMissingPct();

        List<MissingEodRowDto> rows = new ArrayList<>();
        Map<Long, Designation> designationsById = new HashMap<>();
        int totalMissingDays = 0;

        LocalDateTime now = LocalDateTime.now();
        Map<Long, ShiftDefinition> shiftsById = new HashMap<>();

        for (Long empId : filteredEmployeeIds) {
            AppUser emp = employeesById.get(empId);
            ShiftDefinition shift = emp.getShiftId() == null ? null
                    : shiftsById.computeIfAbsent(emp.getShiftId(),
                            id -> shiftRepository.findById(id).orElse(null));
            List<MissingEodDayDto> days = new ArrayList<>();
            int missingCount = 0;
            int totalWorkingDays = 0;

            for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
                String status;
                if (isWeekend(d)) {
                    status = "WEEKEND";
                } else if (holidayDates.contains(d)) {
                    status = "HOLIDAY";
                } else {
                    totalWorkingDays++;
                    EodEntry entry = entryByEmpDate.get(empId + ":" + d);
                    if (entry != null && isLeaveOnlyEntry(entry)) {
                        status = "LEAVE";
                    } else if (isMissing(entry)) {
                        // Only overdue days are gaps. PENDING keeps today visible on the calendar
                        // without counting it as missed or making it remindable — every reminder
                        // path derives its dates from the MISSED days alone.
                        if (isPastDue(d, shift, now)) {
                            status = "MISSED";
                            missingCount++;
                        } else {
                            status = "PENDING";
                        }
                    } else {
                        status = "SUBMITTED";
                    }
                }
                days.add(new MissingEodDayDto(d, status));
            }

            if (missingCount == 0) continue;

            Project project = primaryProjectByEmployee.get(empId);
            String team = emp.getManager() != null ? emp.getManager().getFullName() : null;
            Designation designation = null;
            if (emp.getDesignationId() != null) {
                designation = designationsById.computeIfAbsent(emp.getDesignationId(),
                        id -> designationRepository.findById(id).orElse(null));
            }
            BigDecimal missingPct = totalWorkingDays == 0
                    ? BigDecimal.ZERO
                    : BigDecimal.valueOf(missingCount).multiply(BigDecimal.valueOf(100))
                        .divide(BigDecimal.valueOf(totalWorkingDays), 2, RoundingMode.HALF_UP);
            String rowStatus = missingPct.compareTo(atRiskThresholdPct) >= 0 ? "AT_RISK" : "MISSING";

            rows.add(new MissingEodRowDto(
                    empId, emp.getFullName(), emp.getEmployeeCode(),
                    designation != null ? designation.getTitle() : null,
                    project != null ? project.getName() : null, team,
                    missingCount, totalWorkingDays, missingPct, rowStatus, days));
            totalMissingDays += missingCount;
        }

        rows.sort(Comparator.comparing(MissingEodRowDto::missingCount).reversed());
        return new MissingEodReportDto(rows.size(), totalMissingDays, rows);
    }

    @Transactional
    public int remindEmployee(String actingEmail, Long employeeId, LocalDate from, LocalDate to,
                               Long projectId, String employeeQuery, List<LocalDate> selectedDates) {
        MissingEodReportDto report = getReport(actingEmail, from, to, projectId, employeeQuery);
        MissingEodRowDto row = report.employees().stream()
                .filter(r -> r.employeeId().equals(employeeId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Employee is not in your team's missing-EOD scope"));

        List<LocalDate> missingDates = missingDatesOf(row);
        List<LocalDate> targetDates = (selectedDates == null || selectedDates.isEmpty())
                ? missingDates
                : selectedDates.stream().filter(missingDates::contains).toList();
        if (targetDates.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No matching missing days to remind about");
        }

        sendReminder(row, targetDates);
        return targetDates.size();
    }

    @Transactional
    public int remindAll(String actingEmail, LocalDate from, LocalDate to,
                          Long projectId, String employeeQuery) {
        MissingEodReportDto report = getReport(actingEmail, from, to, projectId, employeeQuery);
        int remindedCount = 0;
        for (MissingEodRowDto row : report.employees()) {
            List<LocalDate> missingDates = missingDatesOf(row);
            if (missingDates.isEmpty()) continue;
            sendReminder(row, missingDates);
            remindedCount++;
        }
        return remindedCount;
    }

    private List<LocalDate> missingDatesOf(MissingEodRowDto row) {
        return row.days().stream()
                .filter(d -> "MISSED".equals(d.status()))
                .map(MissingEodDayDto::date)
                .toList();
    }

    private void sendReminder(MissingEodRowDto row, List<LocalDate> dates) {
        String dateList = dates.stream().limit(5)
                .map(d -> d.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + d.getDayOfMonth())
                .collect(Collectors.joining(", "));
        String suffix = dates.size() > 5 ? " and " + (dates.size() - 5) + " more" : "";
        String message = "You have " + dates.size() + " missing EOD entr" + (dates.size() == 1 ? "y" : "ies")
                + ": " + dateList + suffix;
        // Lands on My EOD History pre-filtered to Missing: this reminder covers several days, so
        // deep-linking one submit form would be wrong — the employee needs to see the whole list.
        notificationService.send(row.employeeId(), "EOD_REMINDER", "Missing EOD reminder", message,
                "/eod/history?status=MISSED");
    }

    private boolean isMissing(EodEntry entry) {
        if (entry == null) return true;
        return switch (entry.getStatus()) {
            case APPROVED, SUBMITTED -> false;
            case DRAFT, REJECTED, MISSED -> true;
        };
    }

    private boolean isLeaveOnlyEntry(EodEntry entry) {
        List<EodTask> tasks = entry.getTasks();
        if (tasks.isEmpty()) return false;
        return tasks.stream().allMatch(t ->
                t.getTaskCategory() != null && LEAVE_HOLIDAY_CATEGORY.equals(t.getTaskCategory().getName()));
    }

    private boolean isWeekend(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
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
