package com.nforceone.sync.reports;

import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import com.nforceone.sync.reports.dto.MissingEodReportDto;
import com.nforceone.sync.reports.dto.TeamReportFiltersDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/team-reports")
@PreAuthorize("hasAnyRole('MANAGER','SUPERADMIN')")
public class TeamReportsController {

    private final TeamEodByEmployeeReportService eodService;
    private final TeamMissingEodReportService missingEodService;
    private final ReportExportService reportExportService;

    public TeamReportsController(TeamEodByEmployeeReportService eodService,
                                  TeamMissingEodReportService missingEodService,
                                  ReportExportService reportExportService) {
        this.eodService = eodService;
        this.missingEodService = missingEodService;
        this.reportExportService = reportExportService;
    }

    /** Projects and clients that the caller's direct reports are allocated to. */
    @GetMapping("/filters")
    public TeamReportFiltersDto getFilters() {
        return eodService.getFilters(actingEmail());
    }

    /** EOD by employee report for the caller's direct reports. */
    @GetMapping("/eod-by-employee")
    public EodByEmployeeReportDto getEodByEmployee(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String employeeQuery) {
        return eodService.getReport(actingEmail(), effectiveFrom(from), effectiveTo(to),
                projectId, client, status, employeeQuery);
    }

    /** Excel/PDF/CSV download of the same EOD report. */
    @GetMapping("/eod-by-employee/export")
    public ResponseEntity<byte[]> exportEodByEmployee(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String employeeQuery,
            @RequestParam(required = false) List<Long> employeeIds,
            @RequestParam String format) {
        LocalDate effectiveFrom = effectiveFrom(from);
        LocalDate effectiveTo = effectiveTo(to);
        EodByEmployeeReportDto report = eodService.getReport(actingEmail(), effectiveFrom, effectiveTo,
                projectId, client, status, employeeQuery);

        if (employeeIds != null && !employeeIds.isEmpty()) {
            Set<Long> wanted = Set.copyOf(employeeIds);
            List<EodByEmployeeRowDto> filtered = report.employees().stream()
                    .filter(e -> wanted.contains(e.employeeId())).toList();
            report = new EodByEmployeeReportDto(filtered.size(),
                    filtered.stream().mapToInt(EodByEmployeeRowDto::entryCount).sum(),
                    filtered.stream().map(EodByEmployeeRowDto::totalHours)
                            .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add),
                    filtered);
        }

        byte[] bytes;
        String extension;
        MediaType contentType;
        switch (format.toUpperCase(Locale.ROOT)) {
            case "CSV" -> {
                bytes = reportExportService.buildCsv(report);
                extension = "csv";
                contentType = MediaType.parseMediaType("text/csv");
            }
            case "EXCEL" -> {
                bytes = reportExportService.buildExcel(report);
                extension = "xlsx";
                contentType = MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            }
            case "PDF" -> {
                bytes = reportExportService.buildPdf(report);
                extension = "pdf";
                contentType = MediaType.APPLICATION_PDF;
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported export format: " + format);
        }

        String filenameBase = filenameBase(report, employeeIds, effectiveFrom, effectiveTo);
        return ResponseEntity.ok()
                .contentType(contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filenameBase + "." + extension).build().toString())
                .body(bytes);
    }

    /** Day-by-day missing-EOD gaps for the caller's direct reports. */
    @GetMapping("/missing-eod")
    public MissingEodReportDto getMissingEod(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String employeeQuery) {
        return missingEodService.getReport(actingEmail(), effectiveFrom(from), effectiveTo(to),
                projectId, employeeQuery);
    }

    public record RemindRequest(List<String> dates) {}

    /** Sends a reminder to one of the caller's team members. */
    @PostMapping("/missing-eod/{employeeId}/remind")
    public Map<String, Integer> remindMissingEod(
            @PathVariable Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String employeeQuery,
            @RequestBody(required = false) RemindRequest body) {
        List<LocalDate> selectedDates = body != null && body.dates() != null
                ? body.dates().stream().map(LocalDate::parse).toList()
                : null;
        int reminded = missingEodService.remindEmployee(actingEmail(), employeeId,
                effectiveFrom(from), effectiveTo(to), projectId, employeeQuery, selectedDates);
        return Map.of("remindedDays", reminded);
    }

    /** Reminds every member of the caller's team about their own missing days. */
    @PostMapping("/missing-eod/remind-all")
    public Map<String, Integer> remindAllMissingEod(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String employeeQuery) {
        int reminded = missingEodService.remindAll(actingEmail(), effectiveFrom(from), effectiveTo(to),
                projectId, employeeQuery);
        return Map.of("remindedCount", reminded);
    }

    private LocalDate effectiveFrom(LocalDate from) {
        return from != null ? from : LocalDate.now().withDayOfMonth(1);
    }

    private LocalDate effectiveTo(LocalDate to) {
        return to != null ? to : LocalDate.now();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    /**
     * Same convention as the PM's report (see ReportsController#filenameBase): one human-readable
     * "{who}-{from}-to-{to}" base for every format, so the Excel, PDF and CSV of one download
     * differ only by extension.
     */
    private String filenameBase(EodByEmployeeReportDto report, List<Long> employeeIds,
                                 LocalDate from, LocalDate to) {
        if (employeeIds != null && employeeIds.size() == 1 && report.employees().size() == 1) {
            String empName = sanitizeForFilename(report.employees().get(0).employeeName());
            return empName + "-" + formatOrdinalDate(from) + "-to-" + formatOrdinalDate(to);
        }
        return "team-eod-" + formatOrdinalDate(from) + "-to-" + formatOrdinalDate(to);
    }

    private String formatOrdinalDate(LocalDate date) {
        int day = date.getDayOfMonth();
        String month = date.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH);
        return day + ordinalSuffix(day) + "-" + month + "-" + date.getYear();
    }

    private String ordinalSuffix(int day) {
        if (day >= 11 && day <= 13) return "th";
        return switch (day % 10) {
            case 1 -> "st";
            case 2 -> "nd";
            case 3 -> "rd";
            default -> "th";
        };
    }

    private String sanitizeForFilename(String name) {
        String cleaned = name.trim().replaceAll("\\s+", "-").replaceAll("[^A-Za-z0-9-_]", "");
        return cleaned.isEmpty() ? "Employee" : cleaned;
    }
}
