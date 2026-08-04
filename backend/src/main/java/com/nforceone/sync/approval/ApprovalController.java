package com.nforceone.sync.approval;

import com.nforceone.sync.approval.dto.ApproveRequest;
import com.nforceone.sync.approval.dto.BatchApproveRequest;
import com.nforceone.sync.approval.dto.RejectRequest;
import com.nforceone.sync.approval.dto.RequestChangesRequest;
import com.nforceone.sync.eod.dto.EodEntryDto;
import jakarta.validation.Valid;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/approvals")
public class ApprovalController {

    private final ApprovalService approvalService;

    public ApprovalController(ApprovalService approvalService) {
        this.approvalService = approvalService;
    }

    // from/to are optional — omitted (or only one supplied) falls back to the full all-time
    // backlog, preserving today's behavior everywhere this endpoint is already used unscoped.
    @GetMapping("/pending")
    public List<EodEntryDto> getPending(@RequestParam(required = false) LocalDate from,
                                        @RequestParam(required = false) LocalDate to) {
        return approvalService.getPendingForActor(actingEmail(), from, to);
    }

    @PostMapping("/{entryId}/approve")
    public EodEntryDto approve(@PathVariable Long entryId,
                               @RequestBody(required = false) ApproveRequest request) {
        Boolean override = request != null ? request.billableOverride() : null;
        String  comment  = request != null ? request.comment()  : null;
        return approvalService.approve(entryId, actingEmail(), override, comment);
    }

    @PostMapping("/{entryId}/reject")
    public EodEntryDto reject(@PathVariable Long entryId,
                              @Valid @RequestBody RejectRequest request) {
        return approvalService.reject(entryId, actingEmail(), request.comment());
    }

    @PostMapping("/{entryId}/request-changes")
    public EodEntryDto requestChanges(@PathVariable Long entryId,
                                      @Valid @RequestBody RequestChangesRequest request) {
        return approvalService.requestChanges(entryId, actingEmail(), request.comment());
    }

    @PostMapping("/batch-approve")
    public List<EodEntryDto> batchApprove(@Valid @RequestBody BatchApproveRequest request) {
        return approvalService.batchApprove(request.entryIds(), actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
