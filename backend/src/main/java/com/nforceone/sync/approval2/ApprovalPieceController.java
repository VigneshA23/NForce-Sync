package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.approval2.dto.RejectPieceRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v2/approvals")
public class ApprovalPieceController {

    private final ApprovalPieceService pieceService;

    public ApprovalPieceController(ApprovalPieceService pieceService) {
        this.pieceService = pieceService;
    }

    @GetMapping("/pending")
    public List<ApprovalPieceDto> getPending() {
        return pieceService.getPendingForActor(actingEmail());
    }

    @GetMapping("/entry/{entryId}/pieces")
    public List<ApprovalPieceDto> getPiecesForEntry(@PathVariable Long entryId) {
        return pieceService.getPiecesForEntry(entryId, actingEmail());
    }

    @PostMapping("/pieces/{pieceId}/approve")
    public ApprovalPieceDto approve(@PathVariable Long pieceId,
                                     @RequestBody(required = false) ApprovePieceRequest request) {
        String comment = request != null ? request.comment() : null;
        return pieceService.approve(pieceId, actingEmail(), comment);
    }

    @PostMapping("/pieces/{pieceId}/reject")
    public ApprovalPieceDto reject(@PathVariable Long pieceId,
                                    @Valid @RequestBody RejectPieceRequest request) {
        return pieceService.reject(pieceId, actingEmail(), request.comment());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    record ApprovePieceRequest(String comment) {}
}
