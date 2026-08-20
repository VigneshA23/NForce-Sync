package com.nforceone.sync.reports;

import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import com.nforceone.sync.reports.dto.MissingEodReportDto;
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
@RequestMapping("/api/reports")
@PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
public class ReportsController {

    private final EodByEmployeeReportService eodByEmployeeReportService;
    private final ReportExportService reportExportService;
    private final MissingEodReportService missingEodReportService;

    public ReportsController(EodByEmployeeReportService eodByEmployeeReportService,
                              ReportExportService reportExportService,
                              MissingEodReportService missingEodReportService) {
        this.eodByEmployeeReportService = eodByEmployeeReportService;
        this.reportExportService = reportExportService;
        this.missingEodReportService = missingEodReportService;
    }

    /** Day-by-day missing-EOD gaps for the employees allocated to the caller's projects. */
    @GetMapping("/missing-eod")
    public MissingEodReportDto getMissingEod(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String employeeQuery) {
        return missingEodReportService.getReport(
                actingEmail(), effectiveFrom(from), effectiveTo(to), projectId, teamManagerId, employeeQuery);
    }

    public record RemindRequest(List<String> dates) {
    }

    /** Reminds one employee about their missing EOD entries — all of them, or just {@code dates} if given. */
    @PostMapping("/missing-eod/{employeeId}/remind")
    public Map<String, Integer> remindMissingEod(
            @PathVariable Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String employeeQuery,
            @RequestBody(required = false) RemindRequest body) {
        List<LocalDate> selectedDates = body != null && body.dates() != null
                ? body.dates().stream().map(LocalDate::parse).toList()
                : null;
        int reminded = missingEodReportService.remindEmployee(
                actingEmail(), employeeId, effectiveFrom(from), effectiveTo(to), projectId, teamManagerId, employeeQuery, selectedDates);
        return Map.of("remindedDays", reminded);
    }

    /** Reminds every employee currently in the missing-EOD list about their own gaps. */
    @PostMapping("/missing-eod/remind-all")
    public Map<String, Integer> remindAllMissingEod(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String employeeQuery) {
        int reminded = missingEodReportService.remindAll(
                actingEmail(), effectiveFrom(from), effectiveTo(to), projectId, teamManagerId, employeeQuery);
        return Map.of("remindedCount", reminded);
    }

    /**
     * Every EOD entry for the employees allocated to the caller's projects in the given range,
     * one row per employee. Defaults the date range to the current month when omitted, matching
     * ProjectDashboardController's convention.
     */
    @GetMapping("/eod-by-employee")
    public EodByEmployeeReportDto getEodByEmployee(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String billable,
            @RequestParam(required = false) String employeeQuery) {
        LocalDate effectiveFrom = effectiveFrom(from);
        LocalDate effectiveTo = effectiveTo(to);
        return eodByEmployeeReportService.getReport(
                actingEmail(), effectiveFrom, effectiveTo, projectId, client, teamManagerId, status, billable, employeeQuery);
    }

    /**
     * Excel/PDF/CSV download of the same report {@link #getEodByEmployee} shows on screen. When
     * {@code employeeIds} is present, narrows the already-scoped result down to just those IDs —
     * safe, since it only filters a list the caller is already authorized to see rather than
     * trusting the IDs as a raw lookup.
     */
    @GetMapping("/eod-by-employee/export")
    public ResponseEntity<byte[]> exportEodByEmployee(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String billable,
            @RequestParam(required = false) String employeeQuery,
            @RequestParam(required = false) List<Long> employeeIds,
            @RequestParam String format) {
        LocalDate effectiveFrom = effectiveFrom(from);
        LocalDate effectiveTo = effectiveTo(to);
        EodByEmployeeReportDto report = eodByEmployeeReportService.getReport(
                actingEmail(), effectiveFrom, effectiveTo, projectId, client, teamManagerId, status, billable, employeeQuery);

        if (employeeIds != null && !employeeIds.isEmpty()) {
            Set<Long> wanted = Set.copyOf(employeeIds);
            List<EodByEmployeeRowDto> filtered = report.employees().stream()
                    .filter(e -> wanted.contains(e.employeeId()))
                    .toList();
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
        String filename = filenameBase + "." + extension;
        return ResponseEntity.ok()
                .contentType(contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .body(bytes);
    }

    /**
     * One naming convention for every download, whatever the format: a human-readable
     * "{who}-{from}-to-{to}" (e.g. "Venky-1st-Aug-2026-to-6th-Aug-2026"). A single-employee
     * download names the person, since that's the file the PM will actually be hunting for in a
     * folder full of other downloads; a bulk one names the report. The extension is the only
     * thing that distinguishes the Excel, PDF and CSV of the same download from each other.
     */
    private String filenameBase(EodByEmployeeReportDto report, List<Long> employeeIds,
                                 LocalDate from, LocalDate to) {
        if (employeeIds != null && employeeIds.size() == 1 && report.employees().size() == 1) {
            String empName = sanitizeForFilename(report.employees().get(0).employeeName());
            return empName + "-" + formatOrdinalDate(from) + "-to-" + formatOrdinalDate(to);
        }
        return "eod-by-employee-" + formatOrdinalDate(from) + "-to-" + formatOrdinalDate(to);
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

    private LocalDate effectiveFrom(LocalDate from) {
        return from != null ? from : LocalDate.now().withDayOfMonth(1);
    }

    private LocalDate effectiveTo(LocalDate to) {
        return to != null ? to : LocalDate.now();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
