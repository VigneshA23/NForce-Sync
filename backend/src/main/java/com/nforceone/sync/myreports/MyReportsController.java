package com.nforceone.sync.myreports;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.approval2.dto.RejectPieceRequest;
import com.nforceone.sync.teamlead.dto.MemberEodStatusDto;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

/**
 * Reporting Manager "My Reports" endpoints. No class-level @PreAuthorize — service enforces
 * the "has direct reports" gate, making this accessible to any authenticated role that has
 * at least one person with manager_id pointing to them (ADMIN, REPORTING_MANAGER, PM, etc.).
 */
@RestController
@RequestMapping("/api/my-reports")
public class MyReportsController {

    private final MyReportsService myReportsService;

    public MyReportsController(MyReportsService myReportsService) {
        this.myReportsService = myReportsService;
    }

    @GetMapping("/summary")
    public TeamLeadSummaryDto getSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        validateRange(from, to);
        return myReportsService.getSummary(from, to, actingEmail());
    }

    @GetMapping("/member-statuses")
    public List<MemberEodStatusDto> getMemberStatuses(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        validateRange(from, to);
        return myReportsService.getMemberStatuses(from, to, actingEmail());
    }

    @GetMapping("/eod")
    public MemberEodDetailDto getMemberEod(
            @RequestParam Long employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return myReportsService.getMemberEod(employeeId, date, actingEmail());
    }

    @GetMapping("/approvals/pending")
    public List<ApprovalPieceDto> getPendingApprovals() {
        return myReportsService.getPendingApprovals(actingEmail());
    }

    @GetMapping("/approvals/decided-entries")
    public List<ApprovalPieceDto> getDecidedApprovals(@RequestParam String status) {
        return myReportsService.getDecidedApprovals(actingEmail(), status);
    }

    @PostMapping("/approvals/pieces/{pieceId}/approve")
    public ApprovalPieceDto approve(
            @PathVariable Long pieceId,
            @RequestBody(required = false) ApprovePieceRequest request) {
        return myReportsService.approve(pieceId, actingEmail(), request != null ? request.comment() : null);
    }

    @PostMapping("/approvals/pieces/{pieceId}/reject")
    public ApprovalPieceDto reject(
            @PathVariable Long pieceId,
            @Valid @RequestBody RejectPieceRequest request) {
        return myReportsService.reject(pieceId, actingEmail(), request.comment());
    }

    // Clarification threads on entries whose frozen manager is the caller. The thread itself is read and
    // answered through the shared /team-lead/eod/{id}/clarification endpoints, which authorise the frozen RM.
    @GetMapping("/eod-inbox")
    public List<com.nforceone.sync.eod.dto.EodInboxItemDto> getEodInbox(
            @RequestParam(defaultValue = "true") boolean open) {
        return myReportsService.getEodInbox(open, actingEmail());
    }

    // Blockers raised by direct reports who lead the project they raised them on. Scoped to the
    // entry's frozen manager in the query; the thread itself is read and replied to through the
    // shared /team-lead/blockers/{id}/replies endpoints, which already authorise the frozen manager.
    @GetMapping("/blockers")
    public List<com.nforceone.sync.teamlead.dto.TeamBlockerDto> getBlockers(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean includeAcknowledged) {
        validateRange(from, to);
        return myReportsService.getBlockers(from, to, includeAcknowledged, actingEmail());
    }

    @GetMapping("/blockers/{taskId}")
    public com.nforceone.sync.teamlead.dto.TeamBlockerDto getBlocker(@PathVariable Long taskId) {
        return myReportsService.getBlocker(taskId, actingEmail());
    }

    @PatchMapping("/blockers/{taskId}/acknowledge")
    public com.nforceone.sync.teamlead.dto.TeamBlockerDto acknowledgeBlocker(@PathVariable Long taskId) {
        return myReportsService.acknowledgeBlocker(taskId, actingEmail());
    }

    @PatchMapping("/blockers/{taskId}/status")
    public com.nforceone.sync.teamlead.dto.TeamBlockerDto setBlockerStatus(
            @PathVariable Long taskId,
            @RequestBody com.nforceone.sync.teamlead.dto.BlockerStatusRequest body) {
        return myReportsService.setBlockerStatus(taskId, actingEmail(), body);
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    record ApprovePieceRequest(String comment) {}
}
