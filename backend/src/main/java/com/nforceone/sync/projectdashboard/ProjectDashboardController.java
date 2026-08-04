package com.nforceone.sync.projectdashboard;

import com.nforceone.sync.projectdashboard.dto.ProjectDashboardFiltersDto;
import com.nforceone.sync.projectdashboard.dto.ProjectDashboardSummaryDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/project-dashboard")
@PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
public class ProjectDashboardController {

    private final ProjectDashboardService dashboardService;

    public ProjectDashboardController(ProjectDashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    /** Option lists (projects/employees/teams/clients) for the dashboard's filter bar. */
    @GetMapping("/filters")
    public ProjectDashboardFiltersDto getFilters() {
        return dashboardService.getFilters(actingEmail());
    }

    /**
     * The full dashboard payload in one round trip — every summary card and widget — scoped to
     * the caller's own projects and optionally narrowed by the given filters. Defaults the date
     * range to the current month when omitted.
     */
    @GetMapping("/summary")
    public ProjectDashboardSummaryDto getSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String client) {
        LocalDate today = LocalDate.now();
        LocalDate effectiveFrom = from != null ? from : today.withDayOfMonth(1);
        LocalDate effectiveTo = to != null ? to : today;
        return dashboardService.getSummary(
                actingEmail(), effectiveFrom, effectiveTo, projectId, employeeId, teamManagerId, client);
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
