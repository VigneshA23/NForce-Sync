package com.nforceone.sync.teamlead;

import com.nforceone.sync.teamlead.dto.DashboardTrendDto;
import com.nforceone.sync.teamlead.dto.MemberEodStatusDto;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import com.nforceone.sync.teamlead.dto.TeamMemberDetailDto;
import com.nforceone.sync.teamlead.dto.ThresholdsDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        validateRange(from, to);
        return teamLeadService.getSummary(from, to, actingEmail());
    }

    @GetMapping("/team-members/status")
    public List<MemberEodStatusDto> getMemberStatuses(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        validateRange(from, to);
        return teamLeadService.getMemberStatuses(from, to, actingEmail());
    }

    @GetMapping("/blockers")
    public List<TeamBlockerDto> getBlockers(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        validateRange(from, to);
        return teamLeadService.getBlockers(from, to, actingEmail());
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
    }

    @GetMapping("/dashboard/trend")
    public DashboardTrendDto getTrend(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "7") int days) {
        return teamLeadService.getTrend(date, days, actingEmail());
    }

    @GetMapping("/team-members/{employeeId}/detail")
    public TeamMemberDetailDto getMemberDetail(
            @PathVariable Long employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "7") int days) {
        if (days < 1 || days > 90) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'days' must be between 1 and 90");
        }
        return teamLeadService.getMemberDetail(employeeId, date, days, actingEmail());
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
