package com.nforceone.sync.team;

import com.nforceone.sync.team.dto.DashboardStatsDto;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/team")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping("/{managerId}/dashboard-stats")
    public DashboardStatsDto getDashboardStats(@PathVariable Long managerId) {
        return teamService.getDashboardStats(managerId, actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
