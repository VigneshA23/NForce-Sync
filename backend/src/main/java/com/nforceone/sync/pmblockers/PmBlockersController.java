package com.nforceone.sync.pmblockers;

import com.nforceone.sync.pmblockers.dto.PmBlockerDto;
import com.nforceone.sync.pmblockers.dto.PmBlockersFiltersDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** Read-only, cross-team Blockers view for Project Managers — no reply/status-change endpoints,
 *  unlike {@code TeamLeadController}'s blocker surface. */
@RestController
@RequestMapping("/api/pm-blockers")
@PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
public class PmBlockersController {

    private final PmBlockersService blockersService;

    public PmBlockersController(PmBlockersService blockersService) {
        this.blockersService = blockersService;
    }

    /** Option lists (projects/teams) for the page's filter bar. */
    @GetMapping("/filters")
    public PmBlockersFiltersDto getFilters() {
        return blockersService.getFilters(actingEmail());
    }

    @GetMapping
    public List<PmBlockerDto> getBlockers(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long teamManagerId,
            @RequestParam(required = false) String status) {
        return blockersService.getBlockers(actingEmail(), from, to, projectId, teamManagerId, status);
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
