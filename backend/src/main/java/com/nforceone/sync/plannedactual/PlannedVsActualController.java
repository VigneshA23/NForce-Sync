package com.nforceone.sync.plannedactual;

import com.nforceone.sync.plannedactual.dto.PlannedVsActualSummaryDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * PM "Planned vs Actual Utilization" tab. Project/employee filter options are already served by
 * {@code GET /api/project-dashboard/filters} (identically PM-scoped) — reused as-is by the
 * frontend rather than duplicated here.
 */
@RestController
@RequestMapping("/api/planned-vs-actual")
@PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
public class PlannedVsActualController {

    private final PlannedVsActualService service;

    public PlannedVsActualController(PlannedVsActualService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public PlannedVsActualSummaryDto getSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long employeeId) {
        LocalDate today = LocalDate.now();
        LocalDate effectiveFrom = from != null ? from : today.withDayOfMonth(1);
        LocalDate effectiveTo = to != null ? to : today;
        return service.getSummary(actingEmail(), effectiveFrom, effectiveTo, projectId, employeeId);
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
