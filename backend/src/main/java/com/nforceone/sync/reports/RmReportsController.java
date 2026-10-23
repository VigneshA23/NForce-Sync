package com.nforceone.sync.reports;

import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.reports.dto.EodByEmployeeReportDto;
import com.nforceone.sync.reports.dto.EodByEmployeeRowDto;
import com.nforceone.sync.reports.dto.TeamReportFiltersDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * My Reporting Team > Reports. No class-level {@code @PreAuthorize}: the service resolves the caller and
 * {@code EodAccessPolicy} decides — a caller with no direct reports, or an {@code employeeId} outside his
 * reporting team, gets 403. Same response shape and export as the PM and Team Lead reports.
 */
@RestController
@RequestMapping("/api/my-reports/eod-by-employee")
public class RmReportsController {

    private final RmEodByEmployeeReportService reportService;
    private final ReportExportService reportExportService;
    private final BusinessClock businessClock;

    public RmReportsController(RmEodByEmployeeReportService reportService, ReportExportService reportExportService,
                               BusinessClock businessClock) {
        this.businessClock = businessClock;
        this.reportService = reportService;
        this.reportExportService = reportExportService;
    }

    /** Projects and clients of the caller's direct reports. */
    @GetMapping("/filters")
    public TeamReportFiltersDto getFilters() {
        return reportService.getFilters(actingEmail());
    }

    @GetMapping
    public EodByEmployeeReportDto getEodByEmployee(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String employeeQuery) {
        return reportService.getReport(actingEmail(), effectiveFrom(from), effectiveTo(to),
                employeeId, projectId, client, status, employeeQuery);
    }

    /** Excel/PDF/CSV download of the same report. */
    @GetMapping("/export")
    public ResponseEntity<byte[]> exportEodByEmployee(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String client,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String employeeQuery,
            @RequestParam(required = false) List<Long> employeeIds,
            @RequestParam String format) {
        LocalDate effectiveFrom = effectiveFrom(from);
        LocalDate effectiveTo = effectiveTo(to);
        EodByEmployeeReportDto report = reportService.getReport(actingEmail(), effectiveFrom, effectiveTo,
                employeeId, projectId, client, status, employeeQuery);

        // Narrows an already-scoped list, so ids outside the caller's team simply match nothing.
        if (employeeIds != null && !employeeIds.isEmpty()) {
            Set<Long> wanted = Set.copyOf(employeeIds);
            List<EodByEmployeeRowDto> filtered = report.employees().stream()
                    .filter(e -> wanted.contains(e.employeeId())).toList();
            report = new EodByEmployeeReportDto(filtered.size(),
                    filtered.stream().mapToInt(EodByEmployeeRowDto::entryCount).sum(),
                    filtered.stream().map(EodByEmployeeRowDto::totalHours).reduce(BigDecimal.ZERO, BigDecimal::add),
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

        String base = filenameBase(report, employeeIds, effectiveFrom, effectiveTo);
        return ResponseEntity.ok()
                .contentType(contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(base + "." + extension).build().toString())
                .body(bytes);
    }

    private LocalDate effectiveFrom(LocalDate from) {
        return from != null ? from : businessClock.today().withDayOfMonth(1);
    }

    private LocalDate effectiveTo(LocalDate to) {
        return to != null ? to : businessClock.today();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    /** "{who}-{from}-to-{to}", the same convention as the PM and Team Lead downloads. */
    private String filenameBase(EodByEmployeeReportDto report, List<Long> employeeIds, LocalDate from, LocalDate to) {
        if (employeeIds != null && employeeIds.size() == 1 && report.employees().size() == 1) {
            String name = report.employees().get(0).employeeName().trim().replaceAll("\\s+", "-")
                    .replaceAll("[^A-Za-z0-9-_]", "");
            return (name.isEmpty() ? "Employee" : name) + "-" + ordinalDate(from) + "-to-" + ordinalDate(to);
        }
        return "reporting-team-eod-" + ordinalDate(from) + "-to-" + ordinalDate(to);
    }

    private String ordinalDate(LocalDate date) {
        int day = date.getDayOfMonth();
        String suffix = (day >= 11 && day <= 13) ? "th" : switch (day % 10) {
            case 1 -> "st";
            case 2 -> "nd";
            case 3 -> "rd";
            default -> "th";
        };
        return day + suffix + "-" + date.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + "-" + date.getYear();
    }
}
