package com.nforceone.sync.myreports.utilization;

import com.nforceone.sync.myreports.utilization.UtilizationDtos.UtilizationDaysDto;
import com.nforceone.sync.myreports.utilization.UtilizationDtos.UtilizationEntriesDto;
import com.nforceone.sync.myreports.utilization.UtilizationDtos.UtilizationSummaryDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * Team Utilization page (My Reporting Team). Read-only. No class-level @PreAuthorize — like the rest
 * of /api/my-reports, access is enforced by the service through {@link UtilizationAccessPolicy}
 * (caller must have direct reports; every employee ID must be in their reporting scope).
 */
@RestController
@RequestMapping("/api/my-reports/utilization")
public class MyReportsUtilizationController {

    private final MyReportsUtilizationService service;

    public MyReportsUtilizationController(MyReportsUtilizationService service) {
        this.service = service;
    }

    /** One call: team average, delta, status counts and every member's aggregate for the period. */
    @GetMapping("/summary")
    public UtilizationSummaryDto getSummary(@RequestParam String period) {
        return service.getSummary(period, actingEmail());
    }

    /** Per-day utilization for one member, for the expanded row's date picker. */
    @GetMapping("/days")
    public UtilizationDaysDto getDays(
            @RequestParam Long employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.getDays(employeeId, from, to, actingEmail());
    }

    /** The submitted EOD entries behind one member's utilization on one date. */
    @GetMapping("/entries")
    public UtilizationEntriesDto getEntries(
            @RequestParam Long employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return service.getEntries(employeeId, date, actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
