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

    @GetMapping("/approvals/pending")
    public List<ApprovalPieceDto> getPendingApprovals() {
        return myReportsService.getPendingApprovals(actingEmail());
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
