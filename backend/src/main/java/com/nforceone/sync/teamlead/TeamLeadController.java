package com.nforceone.sync.teamlead;

import com.nforceone.sync.teamlead.dto.DashboardTrendDto;
import com.nforceone.sync.teamlead.dto.MemberEodStatusDto;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import com.nforceone.sync.teamlead.dto.ThresholdsDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/team-lead")
public class TeamLeadController {

    private final TeamLeadService teamLeadService;

    public TeamLeadController(TeamLeadService teamLeadService) {
        this.teamLeadService = teamLeadService;
    }

    @GetMapping("/dashboard/summary")
    public TeamLeadSummaryDto getSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return teamLeadService.getSummary(date, actingEmail());
    }

    @GetMapping("/team-members/status")
    public List<MemberEodStatusDto> getMemberStatuses(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return teamLeadService.getMemberStatuses(date, actingEmail());
    }

    @GetMapping("/blockers")
    public List<TeamBlockerDto> getBlockers(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return teamLeadService.getBlockers(date, actingEmail());
    }

    @GetMapping("/dashboard/trend")
    public DashboardTrendDto getTrend(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "7") int days) {
        return teamLeadService.getTrend(date, days, actingEmail());
    }

    @PatchMapping("/blockers/{taskId}/acknowledge")
    public TeamBlockerDto acknowledgeBlocker(@PathVariable Long taskId) {
        return teamLeadService.acknowledgeBlocker(taskId, actingEmail());
    }

    // Reuses the existing Admin Config (business_rule_config) row — this just exposes the
    // subset Team Leads need, since /api/admin/business-rules/config is SUPERADMIN-only.
    @GetMapping("/thresholds")
    public ThresholdsDto getThresholds() {
        return teamLeadService.getThresholds();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
