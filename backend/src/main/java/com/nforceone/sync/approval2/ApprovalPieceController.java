package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.approval2.dto.RejectPieceRequest;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@RestController
@RequestMapping("/api/v2/approvals")
public class ApprovalPieceController {

    private final ApprovalPieceService pieceService;
    private final EscalationScheduler escalationScheduler;
    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;

    public ApprovalPieceController(ApprovalPieceService pieceService,
                                    EscalationScheduler escalationScheduler,
                                    AppUserRepository userRepository,
                                    AuditLogRepository auditLogRepository) {
        this.pieceService = pieceService;
        this.escalationScheduler = escalationScheduler;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping("/pending")
    public List<ApprovalPieceDto> getPending() {
        return pieceService.getPendingForActor(actingEmail());
    }

    @GetMapping("/entry/{entryId}/pieces")
    public List<ApprovalPieceDto> getPiecesForEntry(@PathVariable Long entryId) {
        return pieceService.getPiecesForEntry(entryId, actingEmail());
    }

    @GetMapping("/decided-entries")
    public List<EodEntryDto> getDecidedEntries(@RequestParam String status) {
        return pieceService.getDecidedEntriesForActor(actingEmail(), status);
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

    @PostMapping("/admin/trigger-escalation")
    @PreAuthorize("hasRole('SUPERADMIN')")
    @Transactional
    public String triggerEscalation() {
        AppUser actor = userRepository.findByEmailAndDeletedAtIsNull(actingEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        int count = escalationScheduler.triggerNow();
        AuditLog log = new AuditLog();
        log.setEntityType("ESCALATION_SCHEDULER");
        log.setEntityId(0L);
        log.setAction("MANUAL_TRIGGER");
        log.setActor(actor);
        log.setAfterValue("{\"escalated\":" + count + "}");
        log.setOccurredAt(OffsetDateTime.now(ZoneOffset.UTC));
        auditLogRepository.save(log);
        return "Escalated " + count + " piece(s).";
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    record ApprovePieceRequest(String comment) {}
}
