package com.nforceone.sync.approval;

import com.nforceone.sync.approval.dto.ApprovalActionDto;
import com.nforceone.sync.approval.dto.ApproveRequest;
import com.nforceone.sync.approval.dto.BatchApproveRequest;
import com.nforceone.sync.approval.dto.RejectRequest;
import com.nforceone.sync.eod.EodClarificationService;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.dto.EodClarificationStatusDto;
import com.nforceone.sync.eod.dto.EodEntryDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/approvals")
public class ApprovalController {

    private final ApprovalService approvalService;
    private final EodClarificationService clarificationService;

    public ApprovalController(ApprovalService approvalService, EodClarificationService clarificationService) {
        this.approvalService = approvalService;
        this.clarificationService = clarificationService;
    }

    // from/to are optional but must be supplied together — omitting both falls back to the
    // full all-time backlog, preserving today's behavior everywhere this endpoint is already
    // used unscoped. Supplying only one is rejected below rather than silently ignored.
    // pmId/managerId are honored only when the caller is SUPERADMIN (enforced in
    // ApprovalService) — they let a Super Admin narrow the system-wide pending backlog to one
    // specific PM's or Team Lead's view, per the Super Admin Reportee Views enhancement.
    @GetMapping("/pending")
    public List<EodEntryDto> getPending(@RequestParam(required = false) LocalDate from,
                                        @RequestParam(required = false) LocalDate to,
                                        @RequestParam(required = false) Long pmId,
                                        @RequestParam(required = false) Long managerId) {
        if ((from == null) != (to == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "from and to must both be supplied, or both omitted");
        }
        return approvalService.getPendingForActor(actingEmail(), from, to, pmId, managerId);
    }

    // PM-only — entries this PM has personally approved/rejected (Approved/Rejected tabs).
    // pmId/managerId: see getPending's javadoc — SUPERADMIN-only narrowing.
    @GetMapping("/history")
    public List<EodEntryDto> getDecidedHistory(@RequestParam EodEntry.Status status,
                                               @RequestParam(required = false) Long pmId,
                                               @RequestParam(required = false) Long managerId) {
        return approvalService.getDecidedForActor(actingEmail(), status, pmId, managerId);
    }

    // Full approve/reject/request-changes audit trail for one entry, oldest first.
    @GetMapping("/{entryId}/history")
    public List<ApprovalActionDto> getEntryHistory(@PathVariable Long entryId) {
        return approvalService.getHistory(entryId, actingEmail());
    }

    // Backs the Approve/Reject buttons' disabled state in the detail modal — grey them out
    // whenever status is NEEDS_RESPONSE/ACKNOWLEDGED (EodClarificationStatusDto.open), same gate
    // ApprovalService.requireNoOpenClarification enforces server-side on the actual approve/
    // reject calls. Delegates straight to EodClarificationAccessPolicy.requireCanRead, which
    // already covers both a Team Lead and a scoped PM viewing this entry.
    @GetMapping("/{entryId}/clarification-status")
    public EodClarificationStatusDto getClarificationStatus(@PathVariable Long entryId) {
        return clarificationService.getStatus(entryId, actingEmail());
    }

    @PostMapping("/{entryId}/approve")
    public EodEntryDto approve(@PathVariable Long entryId,
                               @RequestBody(required = false) ApproveRequest request) {
        String comment = request != null ? request.comment() : null;
        return approvalService.approve(entryId, actingEmail(), comment);
    }

    @PostMapping("/{entryId}/reject")
    public EodEntryDto reject(@PathVariable Long entryId,
                              @Valid @RequestBody RejectRequest request) {
        return approvalService.reject(entryId, actingEmail(), request.comment());
    }

    // POST /{entryId}/request-changes removed in V44 — reject() covers the same flow, since a
    // rejected entry is editable and resubmittable.

    @PostMapping("/batch-approve")
    public List<EodEntryDto> batchApprove(@Valid @RequestBody BatchApproveRequest request) {
        return approvalService.batchApprove(request.entryIds(), actingEmail());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
