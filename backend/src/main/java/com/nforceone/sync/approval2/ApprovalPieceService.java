package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodClarification;
import com.nforceone.sync.eod.EodClarificationRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLine;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.EodLogLineDto;
import com.nforceone.sync.notification.NotificationDates;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.utilization.UtilizationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
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
    private final EodLogLineRepository logLineRepository;
    private final EodTaskRepository taskRepository;
    private final EodClarificationRepository clarificationRepository;
    private final com.nforceone.sync.teamlead.LeadTeamPolicy leadTeamPolicy;

    public ApprovalPieceService(EodProjectApprovalRepository pieceRepository,
                                 EodProjectApprovalActionRepository actionRepository,
                                 EodEntryRepository entryRepository,
                                 AppUserRepository userRepository,
                                 UtilizationService utilizationService,
                                 NotificationService notificationService,
                                 AuditLogRepository auditLogRepository,
                                 PmScopeService pmScopeService,
                                 EodLogLineRepository logLineRepository,
                                 EodTaskRepository taskRepository,
                                 EodClarificationRepository clarificationRepository,
                                 com.nforceone.sync.teamlead.LeadTeamPolicy leadTeamPolicy) {
        this.leadTeamPolicy = leadTeamPolicy;
        this.pieceRepository = pieceRepository;
        this.actionRepository = actionRepository;
        this.entryRepository = entryRepository;
        this.userRepository = userRepository;
        this.utilizationService = utilizationService;
        this.notificationService = notificationService;
        this.auditLogRepository = auditLogRepository;
        this.pmScopeService = pmScopeService;
        this.logLineRepository = logLineRepository;
        this.taskRepository = taskRepository;
        this.clarificationRepository = clarificationRepository;
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
            // PM-type PROJECT_GROUPED pieces only (no PLAIN_LOG / REPORTING_MANAGER pieces).
            // Escalated LEAD pieces where this PM is the designated fallback are added separately.
            List<EodProjectApproval> pmPieces = pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                    actor.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING);
            List<EodProjectApproval> escalatedToMe = pieceRepository.findByEscalatedToIdAndStatus(
                    actor.getId(), EodProjectApproval.Status.PENDING);
            java.util.Set<Long> seen = new java.util.HashSet<>();
            pieces = new java.util.ArrayList<>();
            for (EodProjectApproval p : pmPieces) { if (seen.add(p.getId())) pieces.add(p); }
            for (EodProjectApproval p : escalatedToMe) { if (seen.add(p.getId())) pieces.add(p); }
        } else {
            pieces = pieceRepository.findByApproverIdAndStatus(actor.getId(), EodProjectApproval.Status.PENDING);
        }
        return mapPiecesWithLogLines(pieces);
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

        return mapPiecesWithLogLines(pieces);
    }

    /**
     * Team Lead pending list: LEAD-type pieces whose approver is the viewer — i.e. the pieces on projects
     * he leads. Reporting-manager pieces are deliberately excluded (they live on My Reporting Team >
     * Pending Approvals), and so are PM-type pieces. Unlike {@link #getPendingForActor}, a lead who also
     * manages a project still gets his LEAD pieces here. Super Admin / Admin keep their existing view.
     * {@code from}/{@code to} optionally narrow by entry date (the Team Dashboard KPI's window).
     */
    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getLeadPendingPieces(String actorEmail, LocalDate from, LocalDate to) {
        AppUser actor = requireUserByEmail(actorEmail);
        if (actor.getRole() == AppUser.Role.SUPERADMIN || actor.getRole() == AppUser.Role.ADMIN) {
            return getPendingForActor(actorEmail);
        }
        List<EodProjectApproval> pieces = pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                actor.getId(), EodProjectApproval.ApproverType.LEAD, EodProjectApproval.Status.PENDING);
        if (from != null && to != null) {
            pieces = pieces.stream()
                    .filter(p -> !p.getEodEntry().getEntryDate().isBefore(from)
                            && !p.getEodEntry().getEntryDate().isAfter(to))
                    .toList();
        }
        return mapPiecesWithLogLines(pieces);
    }

    /**
     * Team Lead Approved/Rejected tabs: entries where the viewer decided a LEAD-type piece, shown with
     * only the tasks on projects he leads plus one aggregate "other projects" hours figure — a shared
     * entry never exposes another lead's project names or task details. Super Admin / Admin keep the
     * previous, unscoped view.
     */
    @Transactional(readOnly = true)
    public List<EodEntryDto> getDecidedEntriesForActor(String actorEmail, String statusName) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval.Status status = EodProjectApproval.Status.valueOf(statusName);
        if (actor.getRole() == AppUser.Role.SUPERADMIN || actor.getRole() == AppUser.Role.ADMIN) {
            return entryRepository.findByApproverPieceStatus(actor.getId(), status)
                    .stream().map(EodEntryDto::from).toList();
        }
        java.util.Set<Long> ledProjects = leadTeamPolicy.ledProjectIds(actor.getId());
        return entryRepository.findByLeadApproverPieceStatus(actor.getId(), status).stream()
                .map(e -> EodEntryDto.from(e).scopedToProjects(ledProjects)
                        .withLeadDecision(status.name(), otherProjectStatuses(e, actor)))
                .toList();
    }

    /**
     * Status is per project, per lead: the entry's own status is an aggregate (any rejection wins), so a
     * Team Lead's card shows his own piece's status instead, and the other projects' decisions ride along
     * as read-only context — project name + status, never task details.
     */
    private List<com.nforceone.sync.eod.dto.OtherProjectStatusDto> otherProjectStatuses(EodEntry entry, AppUser viewer) {
        return pieceRepository.findByEodEntryId(entry.getId()).stream()
                .filter(p -> p.getProject() != null)
                .filter(p -> p.getApprover() == null || !p.getApprover().getId().equals(viewer.getId()))
                .map(p -> new com.nforceone.sync.eod.dto.OtherProjectStatusDto(p.getProject().getName(), p.getStatus().name()))
                .toList();
    }

    /** PM decided tab: PROJECT_GROUPED pieces (PM-type + escalated-LEAD) in a given status. */
    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getDecidedPmPieces(String actorEmail, String statusName) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval.Status status = EodProjectApproval.Status.valueOf(statusName);
        List<EodProjectApproval> pmPieces = pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                actor.getId(), EodProjectApproval.ApproverType.PM, status);
        List<EodProjectApproval> escalatedDecided = pieceRepository.findByEscalatedToIdAndStatus(
                actor.getId(), status);
        java.util.Set<Long> seen = new java.util.HashSet<>();
        java.util.List<EodProjectApproval> all = new java.util.ArrayList<>();
        for (EodProjectApproval p : pmPieces)         { if (seen.add(p.getId())) all.add(p); }
        for (EodProjectApproval p : escalatedDecided)  { if (seen.add(p.getId())) all.add(p); }
        return mapPiecesWithLogLines(all);
    }

    /** Reporting-Manager pending tab: REPORTING_MANAGER pieces still awaiting the actor, with task
     *  and log lines loaded so the hours chip is not built from an empty list. */
    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getPendingReportingManagerPieces(Long actorId) {
        return mapPiecesWithLogLines(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                actorId, EodProjectApproval.ApproverType.REPORTING_MANAGER, EodProjectApproval.Status.PENDING));
    }

    /** Reporting-Manager decided tab: REPORTING_MANAGER pieces in a given status. */
    @Transactional(readOnly = true)
    public List<ApprovalPieceDto> getDecidedReportingManagerPieces(String actorEmail, String statusName) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval.Status status = EodProjectApproval.Status.valueOf(statusName);
        List<EodProjectApproval> pieces = pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                actor.getId(), EodProjectApproval.ApproverType.REPORTING_MANAGER, status);
        return mapPiecesWithLogLines(pieces);
    }

    public ApprovalPieceDto approve(Long pieceId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval piece = requirePieceById(pieceId);

        checkNotSelfApproval(actor, piece);
        checkApproverAuthorization(actor, piece);
        requireNoOpenClarification(piece);
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

        return ApprovalPieceDto.from(piece, loadLogLines(piece), loadTaskLines(piece), actor.getFullName());
    }

    public ApprovalPieceDto reject(Long pieceId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodProjectApproval piece = requirePieceById(pieceId);

        checkNotSelfApproval(actor, piece);
        checkApproverAuthorization(actor, piece);
        requireNoOpenClarification(piece);
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

        return ApprovalPieceDto.from(piece, loadLogLines(piece), loadTaskLines(piece), actor.getFullName());
    }

    /**
     * Entry-level approve / reject for the legacy {@code /api/approvals/{id}/approve|reject} endpoints, which
     * the Team Lead detail modal still calls. It is a thin delegate to the piece path above, so there is ONE
     * decision rule: it acts only on the current-cycle PENDING pieces the actor may decide (his own, an
     * escalated-to-him piece, or — for an Admin / Super Admin — what they could already decide), and each
     * goes through {@link #approve} / {@link #reject}, which enforce the self-approval block, the open
     * clarification gate and the piece-derived entry status. Nothing here (or anywhere else) sets an entry
     * APPROVED without touching its pieces, and a project manager can decide only what was escalated to him.
     */
    public EodEntryDto decideEntryPieces(Long entryId, String actorEmail, boolean approve, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = entryRepository.findWithDetailsById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "EOD entry not found"));

        List<EodProjectApproval> pending = pieceRepository.findByEodEntryId(entryId).stream()
                .filter(p -> p.getStatus() == EodProjectApproval.Status.PENDING)
                .toList();
        if (pending.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This entry has no pending approval pieces; it cannot be approved or rejected");
        }
        List<EodProjectApproval> mine = pending.stream().filter(p -> canActOn(actor, p)).toList();
        if (mine.isEmpty()) {
            if (PmScopeService.entryTouchesManagedProject(actor, entry)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Project Managers can approve or reject only the pieces escalated to them");
            }
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the designated approver, an Admin (for admin-group pieces), or a Super Admin can act on this entry");
        }
        if (!approve && (comment == null || comment.isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Comment is required when rejecting");
        }
        for (EodProjectApproval piece : mine) {
            if (approve) approve(piece.getId(), actorEmail, comment);
            else reject(piece.getId(), actorEmail, comment);
        }
        return EodEntryDto.from(entryRepository.findWithDetailsById(entryId).orElse(entry));
    }

    // ── private helpers ──────────────────────────────────────────────────────

    // Clarification state is per piece (one project + one lead): an open round blocks approve/reject of
    // ITS OWN piece only, so another project's lead keeps full access to theirs. A legacy round (no
    // piece_id — opened before per-piece rounds existed) keeps the old behaviour and blocks every piece
    // of the entry. Enforced here, not only by disabling buttons in the UI.
    private void requireNoOpenClarification(EodProjectApproval piece) {
        Long entryId = piece.getEodEntry().getId();
        // A legacy round (no piece) blocks only the pieces its OPENER holds — a lead is never blocked by a
        // thread they cannot see.
        // A piece escalated to someone else (a PM) is no longer held by the opener, so it is not blocked either.
        boolean escalatedAway = piece.getApprover() != null && piece.getEscalatedTo() != null
                && !piece.getEscalatedTo().getId().equals(piece.getApprover().getId());
        boolean legacyRoundOnMyPiece = piece.getApprover() != null && !escalatedAway
                && clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(
                        entryId, EodClarification.Status.RESOLVED, piece.getApprover().getId());
        if (clarificationRepository.existsByPiece_IdAndStatusNot(piece.getId(), EodClarification.Status.RESOLVED)
                || legacyRoundOnMyPiece) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This entry has an open clarification and cannot be approved or rejected until it is resolved");
        }
    }

    private void checkNotSelfApproval(AppUser actor, EodProjectApproval piece) {
        if (piece.getEodEntry().getEmployee().getId().equals(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "An employee cannot approve or reject their own EOD piece");
        }
    }

    private void checkApproverAuthorization(AppUser actor, EodProjectApproval piece) {
        if (canActOn(actor, piece)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only the designated approver, an Admin (for admin-group pieces), or a Super Admin can act on this piece");
    }

    /** The one "may this user decide this piece" rule: Super Admin, the piece's approver, an Admin on an
     *  ADMIN_GROUP piece, or the PM the piece was escalated to. */
    private boolean canActOn(AppUser actor, EodProjectApproval piece) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return true;
        if (piece.getApprover() != null && piece.getApprover().getId().equals(actor.getId())) return true;
        // Admin can act on ADMIN_GROUP pieces (no specific approver assigned).
        if (actor.getRole() == AppUser.Role.ADMIN
                && piece.getApproverType() == EodProjectApproval.ApproverType.ADMIN_GROUP) return true;
        // PM may act on an escalated piece where they are the designated fallback.
        return piece.getEscalatedTo() != null && piece.getEscalatedTo().getId().equals(actor.getId());
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

    private List<EodLogLineDto> loadLogLines(EodProjectApproval piece) {
        if (piece.getEodEntry().getEntryForm() != EodEntry.EntryForm.PLAIN_LOG) return List.of();
        return logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(piece.getEodEntry().getId())
                .stream().map(EodLogLineDto::from).toList();
    }

    private List<ApprovalPieceDto.TaskLineDto> loadTaskLines(EodProjectApproval piece) {
        if (piece.getEodEntry().getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) return List.of();
        Long projectId = piece.getProject() != null ? piece.getProject().getId() : null;
        if (projectId == null) return List.of();
        List<EodTask> tasks = taskRepository.findByEodEntryIdInWithDetails(
                List.of(piece.getEodEntry().getId()));
        return ApprovalPieceDto.taskLinesFor(tasks, projectId);
    }

    private List<ApprovalPieceDto> mapPiecesWithLogLines(List<EodProjectApproval> pieces) {
        // Batch-load lines for all PLAIN_LOG pieces to avoid N+1.
        List<Long> plainLogEntryIds = pieces.stream()
                .filter(p -> p.getEodEntry().getEntryForm() == EodEntry.EntryForm.PLAIN_LOG)
                .map(p -> p.getEodEntry().getId())
                .distinct()
                .toList();

        java.util.Map<Long, List<EodLogLineDto>> linesByEntryId = new java.util.HashMap<>();
        if (!plainLogEntryIds.isEmpty()) {
            logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(plainLogEntryIds)
                    .forEach(l -> linesByEntryId
                            .computeIfAbsent(l.getEntry().getId(), k -> new java.util.ArrayList<>())
                            .add(EodLogLineDto.from(l)));
        }

        // Batch-load tasks for all PROJECT_GROUPED pieces to avoid N+1.
        List<Long> projectGroupedEntryIds = pieces.stream()
                .filter(p -> p.getEodEntry().getEntryForm() != EodEntry.EntryForm.PLAIN_LOG)
                .map(p -> p.getEodEntry().getId())
                .distinct()
                .toList();

        java.util.Map<Long, List<EodTask>> tasksByEntryId = new java.util.HashMap<>();
        if (!projectGroupedEntryIds.isEmpty()) {
            taskRepository.findByEodEntryIdInWithDetails(projectGroupedEntryIds)
                    .forEach(t -> tasksByEntryId
                            .computeIfAbsent(t.getEodEntry().getId(), k -> new java.util.ArrayList<>())
                            .add(t));
        }

        // Batch-load each decided piece's actual actor to avoid one query per piece. Only
        // APPROVED/REJECTED pieces have an action row; PENDING ones correctly stay unmapped (there's
        // no actor yet — the UI falls back to the designated approverName for those).
        List<Long> decidedPieceIds = pieces.stream()
                .filter(p -> p.getStatus() != EodProjectApproval.Status.PENDING)
                .map(EodProjectApproval::getId)
                .toList();
        java.util.Map<Long, String> actedByNameByPieceId = new java.util.HashMap<>();
        if (!decidedPieceIds.isEmpty()) {
            // Ordered ascending, so the last write per piece id is the latest action.
            actionRepository.findByPieceIdInOrderByActedAtAsc(decidedPieceIds)
                    .forEach(a -> actedByNameByPieceId.put(a.getPiece().getId(), a.getActor().getFullName()));
        }

        return pieces.stream()
                .map(p -> {
                    EodEntry entry = p.getEodEntry();
                    boolean isPlainLog = entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG;
                    List<EodLogLineDto> lines = isPlainLog
                            ? linesByEntryId.getOrDefault(entry.getId(), List.of())
                            : List.of();
                    Long projectId = p.getProject() != null ? p.getProject().getId() : null;
                    List<ApprovalPieceDto.TaskLineDto> taskLines = isPlainLog || projectId == null
                            ? List.of()
                            : ApprovalPieceDto.taskLinesFor(
                                    tasksByEntryId.getOrDefault(entry.getId(), List.of()),
                                    projectId);
                    return ApprovalPieceDto.from(p, lines, taskLines, actedByNameByPieceId.get(p.getId()));
                })
                .toList();
    }
}
