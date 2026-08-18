package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.BlockedTaskDto;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.eod.dto.TimeAdjustmentContextDto;
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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            // Opt-in: adds synthetic MISSED rows for overdue days with no entry. Off by default so
            // callers that expect only real records (e.g. the Submit EOD form) are unaffected.
            @RequestParam(required = false, defaultValue = "false") boolean includeMissing) {
        return eodService.listEntries(employeeId, from, to, includeMissing, actingEmail());
    }

    @GetMapping("/{id}")
    public EodEntryDto getEntry(@PathVariable Long id) {
        return eodService.getEntry(id, actingEmail());
    }

    @GetMapping("/blocked")
    public List<BlockedTaskDto> getBlocked(@RequestParam Long managerId) {
        return eodService.getBlockedTasks(managerId, actingEmail());
    }

    /**
     * Shift timings, monthly allowances and current usage for the caller. Lives here rather
     * than under /api/admin/business-rules because that controller is SUPERADMIN-only and an
     * employee needs to read their own shift. Always scoped to the caller — no employeeId param.
     */
    @GetMapping("/time-adjustment-context")
    public TimeAdjustmentContextDto getTimeAdjustmentContext(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return eodService.getTimeAdjustmentContext(date, actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
