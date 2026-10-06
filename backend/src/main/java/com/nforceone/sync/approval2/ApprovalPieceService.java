package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.notification.NotificationDates;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.utilization.UtilizationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;

@Service
@Transactional
public class ApprovalPieceService {

    private final EodProjectApprovalRepository pieceRepository;
    private final EodProjectApprovalActionRepository actionRepository;
    private final EodEntryRepository entryRepository;
    private final AppUserRepository userRepository;
    private final UtilizationService utilizationService;
    private final NotificationService notificationService;
    private final AuditLogRepository auditLogRepository;
    private final PmScopeService pmScopeService;

    public ApprovalPieceService(EodProjectApprovalRepository pieceRepository,
                                 EodProjectApprovalActionRepository actionRepository,
                                 EodEntryRepository entryRepository,
                                 AppUserRepository userRepository,
                                 UtilizationService utilizationService,
                                 NotificationService notificationService,
                                 AuditLogRepository auditLogRepository,
                                 PmScopeService pmScopeService) {
        this.pieceRepository = pieceRepository;
        this.actionRepository = actionRepository;
        this.entryRepository = entryRepository;
        this.userRepository = userRepository;
        this.utilizationService = utilizationService;
        this.notificationService = notificationService;
        this.auditLogRepository = auditLogRepository;
        this.pmScopeService = pmScopeService;
    }

    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getPendingForActor(String actorEmail) {
        AppUser actor = requireUserByEmail(actorEmail);
        List<EodProjectApproval> pieces;
        if (actor.getRole() == AppUser.Role.SUPERADMIN) {
            pieces = pieceRepository.findAllByStatus(EodProjectApproval.Status.PENDING);
        } else if (actor.getRole() == AppUser.Role.ADMIN) {
            // Admin sees their own assigned pieces + all ADMIN_GROUP pieces (no specific approver).
            List<EodProjectApproval> assigned = pieceRepository.findByApproverIdAndStatus(
                    actor.getId(), EodProjectApproval.Status.PENDING);
            List<EodProjectApproval> adminGroup = pieceRepository.findByApproverTypeAndStatus(
                    EodProjectApproval.ApproverType.ADMIN_GROUP, EodProjectApproval.Status.PENDING);
            java.util.Set<Long> seen = new java.util.HashSet<>();
            pieces = new java.util.ArrayList<>();
            for (EodProjectApproval p : assigned) { if (seen.add(p.getId())) pieces.add(p); }
            for (EodProjectApproval p : adminGroup) { if (seen.add(p.getId())) pieces.add(p); }
        } else if (actor.getRole() == AppUser.Role.PM || pmScopeService.isProjectManager(actor)) {
            // PM-type pieces (no lead) + escalated LEAD pieces where PM is the designated fallback.
            List<EodProjectApproval> pmPieces = pieceRepository.findByApproverIdAndStatus(
                    actor.getId(), EodProjectApproval.Status.PENDING);
            List<EodProjectApproval> escalatedToMe = pieceRepository.findByEscalatedToIdAndStatus(
                    actor.getId(), EodProjectApproval.Status.PENDING);
            java.util.Set<Long> seen = new java.util.HashSet<>();
            pieces = new java.util.ArrayList<>();
            for (EodProjectApproval p : pmPieces) { if (seen.add(p.getId())) pieces.add(p); }
            for (EodProjectApproval p : escalatedToMe) { if (seen.add(p.getId())) pieces.add(p); }
        } else {
            pieces = pieceRepository.findByApproverIdAndStatus(actor.getId(), EodProjectApproval.Status.PENDING);
        }
        return pieces.stream().map(ApprovalPieceDto::from).toList();
    }

    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getPiecesForEntry(Long entryId, String callerEmail) {
        AppUser caller = requireUserByEmail(callerEmail);

        EodEntry entry = entryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "EOD entry not found: " + entryId));

        List<EodProjectApproval> pieces = pieceRepository.findByEodEntryIdWithDetails(entryId);

        if (caller.getRole() != AppUser.Role.SUPERADMIN) {
            boolean isOwner    = caller.getId().equals(entry.getEmployee().getId());
            boolean isApprover = pieces.stream()
                    .anyMatch(p -> p.getApprover() != null &&
                                   p.getApprover().getId().equals(caller.getId()));

            if (!isOwner && !isApprover) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Access denied: not the entry owner, an approver, or a Super Admin");
            }
        }

        return pieces.stream().map(ApprovalPieceDto::from).toList();
    }

    @Transactional(readOnly = true)
    public List<EodEntryDto> getDecidedEntriesForActor(String actorEmail, String statusName) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval.Status status = EodProjectApproval.Status.valueOf(statusName);
        List<EodEntry> entries = entryRepository.findByApproverPieceStatus(actor.getId(), status);
        return entries.stream().map(EodEntryDto::from).toList();
    }

    public ApprovalPieceDto approve(Long pieceId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval piece = requirePieceById(pieceId);

        checkNotSelfApproval(actor, piece);
        checkApproverAuthorization(actor, piece);
        requirePieceStatus(piece, EodProjectApproval.Status.PENDING);

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(piece, actor, EodProjectApprovalAction.Action.APPROVED, comment, now);

        piece.setStatus(EodProjectApproval.Status.APPROVED);
        piece.setActedAt(now);
        pieceRepository.save(piece);

        EodEntry entry = piece.getEodEntry();
        updateEntryStatus(entry);

        // Decision 8: utilization only for EMPLOYEE role; PLAIN_LOG entries are never counted.
        if (entry.getEmployee().getRole() == AppUser.Role.EMPLOYEE
                && entry.getEntryForm() != EodEntry.EntryForm.PLAIN_LOG) {
            utilizationService.recomputeForEntry(entry.getId());
        }

        // Notify the submitter that their piece was approved.
        String dateLabel = NotificationDates.format(entry.getEntryDate());
        if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
            String body = actor.getFullName() + " approved your daily log for " + dateLabel + ".";
            notificationService.send(entry.getEmployee().getId(), "EOD_APPROVED",
                    "Daily log approved", body, "/eod/history");
            writeAuditLog("EOD_ENTRY", entry.getId(), "PLAIN_LOG_APPROVED", actor,
                    "{\"date\":\"" + entry.getEntryDate() + "\",\"pieceId\":" + piece.getId() + "}");
        } else {
            String projectName = piece.getProject() != null ? piece.getProject().getName() : "your entry";
            String body = actor.getFullName() + " approved your EOD entry for " + dateLabel + " — " + projectName + ".";
            notificationService.send(entry.getEmployee().getId(), "EOD_APPROVED",
                    "Entry approved: " + projectName, body, "/eod/history");
        }

        return ApprovalPieceDto.from(piece);
    }

    public ApprovalPieceDto reject(Long pieceId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval piece = requirePieceById(pieceId);

        checkNotSelfApproval(actor, piece);
        checkApproverAuthorization(actor, piece);
        requirePieceStatus(piece, EodProjectApproval.Status.PENDING);

        if (comment == null || comment.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Comment is required when rejecting");
        }

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(piece, actor, EodProjectApprovalAction.Action.REJECTED, comment, now);

        piece.setStatus(EodProjectApproval.Status.REJECTED);
        piece.setActedAt(now);
        piece.setComment(comment);
        pieceRepository.save(piece);

        updateEntryStatus(piece.getEodEntry());

        // Notify the submitter that their piece was rejected.
        EodEntry entry = piece.getEodEntry();
        String dateLabel = NotificationDates.format(entry.getEntryDate());
        if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
            String body = actor.getFullName() + " rejected your daily log for " + dateLabel
                    + ". Reason: " + comment;
            notificationService.send(entry.getEmployee().getId(), "EOD_REJECTED",
                    "Daily log rejected", body, "/eod/submit?date=" + entry.getEntryDate());
            writeAuditLog("EOD_ENTRY", entry.getId(), "PLAIN_LOG_REJECTED", actor,
                    "{\"date\":\"" + entry.getEntryDate() + "\",\"pieceId\":" + piece.getId()
                            + ",\"reason\":\"" + comment.replace("\"", "'") + "\"}");
        } else {
            String projectName = piece.getProject() != null ? piece.getProject().getName() : "your entry";
            String body = actor.getFullName() + " rejected your EOD entry for " + dateLabel
                    + " — " + projectName + ". Reason: " + comment;
            notificationService.send(entry.getEmployee().getId(), "EOD_REJECTED",
                    "Entry rejected: " + projectName, body, "/eod/submit?date=" + entry.getEntryDate());
        }

        return ApprovalPieceDto.from(piece);
    }

    // ── private helpers ──────────────────────────────────────────────────────

    private void checkNotSelfApproval(AppUser actor, EodProjectApproval piece) {
        if (piece.getEodEntry().getEmployee().getId().equals(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "An employee cannot approve or reject their own EOD piece");
        }
    }

    private void checkApproverAuthorization(AppUser actor, EodProjectApproval piece) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (piece.getApprover() != null && piece.getApprover().getId().equals(actor.getId())) return;
        // Admin can act on ADMIN_GROUP pieces (no specific approver assigned).
        if (actor.getRole() == AppUser.Role.ADMIN
                && piece.getApproverType() == EodProjectApproval.ApproverType.ADMIN_GROUP) return;
        // PM may act on an escalated piece where they are the designated fallback.
        if (piece.getEscalatedTo() != null && piece.getEscalatedTo().getId().equals(actor.getId())) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only the designated approver, an Admin (for admin-group pieces), or a Super Admin can act on this piece");
    }

    private void requirePieceStatus(EodProjectApproval piece, EodProjectApproval.Status required) {
        if (piece.getStatus() != required) {
            if (piece.getStatus() == EodProjectApproval.Status.APPROVED
                    || piece.getStatus() == EodProjectApproval.Status.REJECTED) {
                String actorName = actionRepository.findTopByPieceIdOrderByActedAtDesc(piece.getId())
                        .map(a -> a.getActor().getFullName())
                        .orElse("someone");
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "already " + piece.getStatus().name().toLowerCase() + " by " + actorName
                        + ". This piece cannot be acted on again.");
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Piece must be in " + required + " status; current: " + piece.getStatus());
        }
    }

    private void updateEntryStatus(EodEntry entry) {
        List<EodProjectApproval> allPieces = pieceRepository.findByEodEntryId(entry.getId());

        boolean anyRejected = allPieces.stream()
                .anyMatch(p -> p.getStatus() == EodProjectApproval.Status.REJECTED);
        boolean allApproved = allPieces.stream()
                .allMatch(p -> p.getStatus() == EodProjectApproval.Status.APPROVED);
        boolean anyApproved = allPieces.stream()
                .anyMatch(p -> p.getStatus() == EodProjectApproval.Status.APPROVED);
        boolean anyPending = allPieces.stream()
                .anyMatch(p -> p.getStatus() == EodProjectApproval.Status.PENDING);

        EodEntry.Status newStatus;
        if (anyRejected) {
            newStatus = EodEntry.Status.REJECTED;
        } else if (allApproved) {
            newStatus = EodEntry.Status.APPROVED;
        } else if (anyApproved && anyPending) {
            newStatus = EodEntry.Status.PARTIALLY_APPROVED;
        } else {
            newStatus = EodEntry.Status.SUBMITTED;
        }

        entry.setStatus(newStatus);
        entry.setUpdatedAt(OffsetDateTime.now());
        entryRepository.save(entry);
    }

    private void recordAction(EodProjectApproval piece, AppUser actor,
                               EodProjectApprovalAction.Action action, String comment,
                               OffsetDateTime now) {
        EodProjectApprovalAction aa = new EodProjectApprovalAction();
        aa.setPiece(piece);
        aa.setActor(actor);
        aa.setAction(action);
        aa.setComment(comment);
        aa.setActedAt(now);
        actionRepository.save(aa);
    }

    private AppUser requireUserByEmail(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private EodProjectApproval requirePieceById(Long id) {
        return pieceRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Approval piece not found: " + id));
    }

    private void writeAuditLog(String entityType, Long entityId, String action,
                                AppUser actor, String afterValue) {
        AuditLog al = new AuditLog();
        al.setEntityType(entityType);
        al.setEntityId(entityId);
        al.setAction(action);
        al.setActor(actor);
        al.setAfterValue(afterValue);
        al.setOccurredAt(OffsetDateTime.now());
        auditLogRepository.save(al);
    }
}
