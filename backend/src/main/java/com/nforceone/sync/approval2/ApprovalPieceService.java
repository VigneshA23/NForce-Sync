package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
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

    public ApprovalPieceService(EodProjectApprovalRepository pieceRepository,
                                 EodProjectApprovalActionRepository actionRepository,
                                 EodEntryRepository entryRepository,
                                 AppUserRepository userRepository,
                                 UtilizationService utilizationService) {
        this.pieceRepository = pieceRepository;
        this.actionRepository = actionRepository;
        this.entryRepository = entryRepository;
        this.userRepository = userRepository;
        this.utilizationService = utilizationService;
    }

    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getPendingForActor(String actorEmail) {
        AppUser actor = requireUserByEmail(actorEmail);
        List<EodProjectApproval> pieces;
        if (actor.getRole() == AppUser.Role.SUPERADMIN) {
            pieces = pieceRepository.findAllByStatus(EodProjectApproval.Status.PENDING);
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

        // Decision 8: utilization only for EMPLOYEE role
        if (entry.getEmployee().getRole() == AppUser.Role.EMPLOYEE) {
            utilizationService.recomputeForEntry(entry.getId());
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
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only the designated approver or a Super Admin can act on this piece");
    }

    private void requirePieceStatus(EodProjectApproval piece, EodProjectApproval.Status required) {
        if (piece.getStatus() != required) {
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
}
