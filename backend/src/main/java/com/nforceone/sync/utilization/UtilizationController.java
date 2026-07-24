package com.nforceone.sync.utilization;

import com.nforceone.sync.utilization.dto.TeamUtilDto;
import com.nforceone.sync.utilization.dto.UtilSnapshotDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/utilization")
public class UtilizationController {

    private final UtilizationService utilizationService;

    public UtilizationController(UtilizationService utilizationService) {
        this.utilizationService = utilizationService;
    }

    @GetMapping("/employee/{id}")
    public List<UtilSnapshotDto> getForEmployee(
            @PathVariable Long id,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return utilizationService.getForEmployee(id, from, to);
    }

    @GetMapping("/team/{managerId}")
    public List<TeamUtilDto> getForTeam(
            @PathVariable Long managerId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return utilizationService.getForTeam(managerId, date);
    }
}
