package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.BlockedTaskDto;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/eod")
public class EodController {

    private final EodService eodService;

    public EodController(EodService eodService) {
        this.eodService = eodService;
    }

    @PostMapping("/draft")
    @ResponseStatus(HttpStatus.OK)
    public EodEntryDto saveDraft(@Valid @RequestBody SaveEodRequest request) {
        return eodService.saveDraft(request, actingEmail());
    }

    @PostMapping("/{id}/submit")
    public EodEntryDto submit(@PathVariable Long id) {
        return eodService.submit(id, actingEmail());
    }

    @GetMapping
    public List<EodEntryDto> listEntries(
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return eodService.listEntries(employeeId, from, to, actingEmail());
    }

    @GetMapping("/{id}")
    public EodEntryDto getEntry(@PathVariable Long id) {
        return eodService.getEntry(id, actingEmail());
    }

    @GetMapping("/blocked")
    public List<BlockedTaskDto> getBlocked(@RequestParam Long managerId) {
        return eodService.getBlockedTasks(managerId, actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
