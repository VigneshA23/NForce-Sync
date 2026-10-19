package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.EodClarificationAttachmentDto;
import com.nforceone.sync.eod.dto.EodClarificationReplyDto;
import com.nforceone.sync.eod.dto.EodClarificationStatusDto;
import com.nforceone.sync.eod.dto.EodInboxItemDto;
import com.nforceone.sync.notification.NotificationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.nforceone.sync.eod.dto.EodTaskCategoryNameRow;
import com.nforceone.sync.eod.dto.EodTaskProjectNameRow;
import com.nforceone.sync.project.PmScopeService;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collector;
import java.util.stream.Collectors;

/**
 * EOD Clarification — a two-way conversation a Team Lead opens against an employee's SUBMITTED
 * EodEntry from the Approvals detail popup, structurally modeled on BlockerConversationService
 * but attached to the whole entry (not one task) and reopenable across multiple rounds (Blockers'
 * resolve is terminal forever; this one isn't — see EodClarification's javadoc).
 *
 * The entry stays exactly where it already is in Approvals while a round is open — it does not
 * move to a different tab or get excluded from the pending list — Approvals just flags it with a
 * "Clarification Requested" badge (see Approvals.tsx/ApprovalsPM.tsx). It also surfaces in the
 * Team Lead's / PM's EOD Inbox for a conversation-focused view of the same thread.
 * ApprovalService still blocks the actual approve/reject call while a round is open (status
 * NEEDS_RESPONSE or ACKNOWLEDGED); eod_entry.status itself is never touched by any of this.
 */
@Service
@Transactional
public class EodClarificationService {

    // Per-reply attachment count, file type allowlist and per-file/total storage limits mirror
    // BlockerConversationService's exact same constant/config values — same upload flow, kept
    // consistent with Blockers rather than inventing separate governance for this feature.
    private static final int MAX_ATTACHMENTS_PER_REPLY = 4;

    private final long maxFileSizeBytes;
    private final long maxTotalStorageBytes;

    private final EodEntryRepository entryRepository;
    private final EodClarificationRepository clarificationRepository;
    private final EodClarificationReplyRepository replyRepository;
    private final EodClarificationReplyAttachmentRepository attachmentRepository;
    private final EodClarificationReadStateRepository readStateRepository;
    private final EodTaskRepository taskRepository;
    private final AppUserRepository userRepository;
    private final NotificationService notificationService;
    private final PmScopeService pmScopeService;
    private final EodProjectApprovalRepository pieceRepository;

    public EodClarificationService(@Value("${app.eod-attachment.max-file-size-bytes}") long maxFileSizeBytes,
                                    @Value("${app.eod-attachment.max-total-storage-bytes}") long maxTotalStorageBytes,
                                    EodEntryRepository entryRepository,
                                    EodClarificationRepository clarificationRepository,
                                    EodClarificationReplyRepository replyRepository,
                                    EodClarificationReplyAttachmentRepository attachmentRepository,
                                    EodClarificationReadStateRepository readStateRepository,
                                    EodTaskRepository taskRepository,
                                    AppUserRepository userRepository,
                                    NotificationService notificationService,
                                    PmScopeService pmScopeService,
                                    EodProjectApprovalRepository pieceRepository) {
        this.maxFileSizeBytes = maxFileSizeBytes;
        this.maxTotalStorageBytes = maxTotalStorageBytes;
        this.entryRepository = entryRepository;
        this.clarificationRepository = clarificationRepository;
        this.replyRepository = replyRepository;
        this.attachmentRepository = attachmentRepository;
        this.readStateRepository = readStateRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.pmScopeService = pmScopeService;
        this.pieceRepository = pieceRepository;
    }

    @Transactional(readOnly = true)
    public EodClarificationStatusDto getStatus(Long entryId, String actingEmail) {
        return getStatus(entryId, actingEmail, null);
    }

    /**
     * Status of ONE round the viewer may see: {@code clarificationId} when given, otherwise the latest round
     * visible to him. A Team Lead sees only the round on a piece he holds (never another project's); the
     * employee sees every round on his entry and picks one by id when there are several.
     */
    @Transactional(readOnly = true)
    public EodClarificationStatusDto getStatus(Long entryId, String actingEmail, Long clarificationId) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry, pieces);
        // The LATEST visible round — open, or the most recent RESOLVED one — so a resolved thread stays
        // readable. A resolved round reports open=false / status=RESOLVED, so every gate that keys
        // off open or isBlockingStatus treats it as "no round blocking".
        return selectVisibleRound(actor, entry, pieces, clarificationId)
                .map(c -> statusDto(c, actor, entry, pieces))
                .orElseGet(() -> EodClarificationStatusDto.none(canOpenNewRound(actor, entry, pieces)));
    }

    /**
     * Status as it applies to ONE approval piece (the Approvals card / detail modal's own piece): the latest
     * round the viewer may see that is on that piece (or a legacy entry-wide one) — so a card never reflects
     * another project's clarification — or none, with {@code canOpen} for the viewer.
     */
    @Transactional(readOnly = true)
    public EodClarificationStatusDto getStatusForPiece(Long entryId, String actingEmail, Long pieceId) {
        if (pieceId == null) return getStatus(entryId, actingEmail, null);
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry, pieces);
        // A round applies to this piece when it is keyed on it, or — for a legacy round with no piece — when the
        // piece is one its opener holds (a legacy round blocks only its opener's own pieces).
        // "Held by" the opener means the designated approver and NOT escalated to someone else.
        Long pieceApproverId = pieces.stream().filter(p -> p.getId().equals(pieceId)).findFirst()
                .map(p -> p.getApprover() == null
                        || (p.getEscalatedTo() != null && !p.getEscalatedTo().getId().equals(p.getApprover().getId()))
                        ? null : p.getApprover().getId())
                .orElse(null);
        return visibleRounds(actor, entry, pieces).stream()
                .filter(c -> c.getPiece() != null
                        ? c.getPiece().getId().equals(pieceId)
                        : pieceApproverId != null && pieceApproverId.equals(c.getOpenedBy().getId()))
                .findFirst()
                .map(c -> statusDto(c, actor, entry, pieces))
                .orElseGet(() -> EodClarificationStatusDto.none(canOpenNewRound(actor, entry, pieces)));
    }

    @Transactional(readOnly = true)
    public List<EodClarificationReplyDto> getThread(Long entryId, String actingEmail) {
        return getThread(entryId, actingEmail, null);
    }

    @Transactional(readOnly = true)
    public List<EodClarificationReplyDto> getThread(Long entryId, String actingEmail, Long clarificationId) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry, pieces);
        // Only one round's thread is shown — see EodClarificationRepository's javadoc — and only a round the
        // viewer may see: a lead can never read another project's thread.
        return selectVisibleRound(actor, entry, pieces, clarificationId)
                .map(c -> {
                    List<EodClarificationReply> replies = replyRepository.findByClarificationIdOrderByCreatedAtAsc(c.getId());
                    Map<Long, List<EodClarificationAttachmentDto>> byReplyId = attachmentsByReplyId(replies);
                    return replies.stream()
                            .map(r -> EodClarificationReplyDto.from(r, c, byReplyId.getOrDefault(r.getId(), List.of())))
                            .toList();
                })
                .orElse(List.of());
    }

    /** Rounds on this entry the viewer may read, newest first. */
    private List<EodClarification> visibleRounds(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        return clarificationRepository.findByEodEntryIdOrderByOpenedAtDesc(entry.getId()).stream()
                .filter(c -> EodClarificationAccessPolicy.canReadRound(actor, entry, c, pieces))
                .toList();
    }

    /** The round a read endpoint should show: {@code clarificationId} when given (404 if it is not on this
     *  entry, 403 if the viewer may not see it), otherwise the latest visible round. */
    private java.util.Optional<EodClarification> selectVisibleRound(AppUser actor, EodEntry entry,
                                                                    List<EodProjectApproval> pieces, Long clarificationId) {
        if (clarificationId == null) {
            // Default: an OPEN round first (the employee can have one per project), else the latest resolved one.
            List<EodClarification> visible = visibleRounds(actor, entry, pieces);
            return visible.stream().filter(EodClarification::isOpen).findFirst()
                    .or(() -> visible.stream().findFirst());
        }
        EodClarification c = requireRoundOnEntry(entry, clarificationId);
        if (!EodClarificationAccessPolicy.canReadRound(actor, entry, c, pieces)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return java.util.Optional.of(c);
    }

    private EodClarification requireRoundOnEntry(EodEntry entry, Long clarificationId) {
        return clarificationRepository.findById(clarificationId)
                .filter(c -> c.getEodEntry().getId().equals(entry.getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Clarification not found"));
    }

    /**
     * The OPEN round a write endpoint acts on. With {@code clarificationId}: that round (404 / 403 / 409 as
     * above). Without it: the employee's latest open round, or a reviewer's latest open round on a piece he
     * holds — and a reviewer with no open round of his own gets 403 when someone else's is open, never access
     * to it. {@code asReviewer} (resolve / set status) additionally requires the reviewing capacity on it.
     */
    private EodClarification selectOpenRound(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces,
                                              Long clarificationId, boolean asReviewer) {
        EodClarification c;
        if (clarificationId != null) {
            c = requireRoundOnEntry(entry, clarificationId);
            if (!EodClarificationAccessPolicy.canReadRound(actor, entry, c, pieces)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
            }
            if (!c.isOpen()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "No open clarification on this entry");
            }
        } else {
            List<EodClarification> open = clarificationRepository.findByEodEntryIdOrderByOpenedAtDesc(entry.getId()).stream()
                    .filter(EodClarification::isOpen).toList();
            c = open.stream()
                    .filter(r -> asReviewer
                            ? EodClarificationAccessPolicy.canReviewRound(actor, entry, r, pieces)
                            : EodClarificationAccessPolicy.canReplyRound(actor, entry, r, pieces))
                    .findFirst()
                    .orElse(null);
            if (c == null) {
                if (open.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "No open clarification on this entry");
                }
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "The open clarification on this entry belongs to another project");
            }
        }
        boolean allowed = asReviewer
                ? EodClarificationAccessPolicy.canReviewRound(actor, entry, c, pieces)
                : EodClarificationAccessPolicy.canReplyRound(actor, entry, c, pieces);
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You cannot act on another project's clarification");
        }
        return c;
    }

    /** Opens a new round (Approvals' "Request Clarification" action). {@code message} is optional
     *  — the button opens an empty round and the TL is navigated to EOD Inbox to type the actual
     *  question there, same as opening a Blocker conversation doesn't require a first message
     *  either. A non-blank message is still accepted and saved as the opening reply for any other
     *  caller that wants to open-with-a-message in one call. */
    public EodClarificationStatusDto open(Long entryId, String actingEmail, String message) {
        return open(entryId, actingEmail, message, List.of());
    }

    /** Opens a round and, when a first message and/or attachments are supplied, saves it as the
     *  opening reply in the same transaction — the chat popup's "first message creates the round".
     *  The message and files are validated BEFORE the round is created, so a rejected attachment
     *  never leaves an empty round behind. The employee gets exactly one notification
     *  (EOD_CLARIFICATION_REQUESTED), not a second "reply" one. */
    public EodClarificationStatusDto open(Long entryId, String actingEmail, String message,
                                           List<MultipartFile> files) {
        return open(entryId, actingEmail, message, files, null);
    }

    /** As above, on a specific piece: {@code pieceId} picks which of the opener's own pending pieces the round
     *  is about (only needed by a lead of two projects on one EOD; otherwise his single piece is used). */
    public EodClarificationStatusDto open(Long entryId, String actingEmail, String message,
                                           List<MultipartFile> files, Long pieceId) {
        AppUser lead = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanOpenOrResolve(lead, entry, pieces);

        // PARTIALLY_APPROVED is allowed: the still-PENDING pieces are exactly where a clarification
        // is needed. The policy above already requires the opener to hold a PENDING piece (or be a
        // Super Admin), so an approver whose own piece is already approved/rejected cannot open.
        if (!isOpenableStatus(entry)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Clarification can only be requested on a submitted or partially approved entry; current status: "
                            + entry.getStatus());
        }
        if (pieces.stream().noneMatch(p -> p.getStatus() == EodProjectApproval.Status.PENDING)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Clarification can only be requested while at least one piece of this entry is pending");
        }
        // The round is about the opener's OWN piece (one project + one lead). Another project's lead can have
        // a round of his own open at the same time; only a round on THIS piece, or a legacy entry-wide one,
        // is in the way.
        EodProjectApproval piece = pieceForNewRound(lead, entry, pieces, pieceId);
        // (A legacy round with no piece only gets in the way of ITS OWN opener — another lead is unaffected.)
        if (clarificationRepository.existsByPiece_IdAndStatusNot(piece.getId(), EodClarification.Status.RESOLVED)
                || clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(
                        entryId, EodClarification.Status.RESOLVED, lead.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A clarification is already open on this entry");
        }

        boolean hasContent = (message != null && !message.isBlank()) || (files != null && files.stream().anyMatch(f -> !f.isEmpty()));
        if (hasContent) validatedAttachments(message, files);   // fail before creating the round

        OffsetDateTime now = OffsetDateTime.now();
        EodClarification clarification = new EodClarification();
        clarification.setEodEntry(entry);
        clarification.setOpenedBy(lead);
        clarification.setPiece(piece);
        // Snapshot only when the opener really was an approver / escalatee at this moment — a
        // Super Admin opening on someone else's behalf leaves it null. Audit/fallback only.
        if (EodClarificationAccessPolicy.isCurrentApprover(lead, pieces)) {
            clarification.setOpenedByApprover(lead);
        }
        clarification.setOpenedAt(now);
        clarification.setStatus(EodClarification.Status.NEEDS_RESPONSE);
        clarification = clarificationRepository.save(clarification);

        if (hasContent) {
            saveReply(clarification, lead, message, files);
        }

        // Only the employee is told when a round opens — never another project's lead. The text names the project
        // so the employee knows which lead is asking when two rounds are open.
        String forProject = piece.getProject() != null ? " (" + piece.getProject().getName() + ")" : "";
        notificationService.send(entry.getEmployee().getId(), "EOD_CLARIFICATION_REQUESTED",
                "Clarification requested on your EOD entry" + forProject,
                lead.getFullName() + " requested clarification on your EOD entry for "
                        + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate()) + forProject + ".",
                "/employee/eod-inbox?highlight=" + entry.getId());

        return statusDto(clarification, lead, entry, pieces);
    }

    /** The opener's own still-pending piece the new round attaches to. A lead of two projects on this EOD
     *  must say which ({@code pieceId}); a piece he does not hold in a reviewing capacity is refused. */
    private EodProjectApproval pieceForNewRound(AppUser lead, EodEntry entry, List<EodProjectApproval> pieces, Long pieceId) {
        List<EodProjectApproval> mine = EodClarificationAccessPolicy.openablePieces(lead, entry, pieces);
        if (pieceId != null) {
            return mine.stream().filter(p -> p.getId().equals(pieceId)).findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "You can only request clarification on your own project's portion"));
        }
        // No explicit piece: the first of his pieces that has no open round yet (usually he has just one).
        return mine.stream()
                .filter(p -> !clarificationRepository.existsByPiece_IdAndStatusNot(p.getId(), EodClarification.Status.RESOLVED))
                .findFirst()
                .or(() -> mine.stream().findFirst())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Only an approver with a pending review on this entry can manage a clarification on it"));
    }

    /** Marks every clarification round against this entry as read by the caller (opening the EOD
     *  Inbox row's conversation panel) — same read-access check as getThread(). All of an entry's
     *  rounds, not just the latest: the EOD Inbox list shows each round as its own row, but every
     *  row for the same entry opens the exact same latest-round thread (getThread only ever
     *  returns the latest round), so a historical round has no other way to ever be marked read. */
    public void markRead(Long entryId, String actingEmail) {
        markRead(entryId, actingEmail, null);
    }

    /** As above, but for ONE round when {@code clarificationId} is given — opening one project's thread must not
     *  clear the unread dot of another project's. 404 / 403 as for any round the viewer may not see. */
    public void markRead(Long entryId, String actingEmail, Long clarificationId) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry, pieces);

        // Only the rounds this viewer may read — a lead marks his own project's rounds, never another's.
        List<EodClarification> rounds;
        if (clarificationId != null) {
            EodClarification one = requireRoundOnEntry(entry, clarificationId);
            requireCanReadRound(actor, entry, one, pieces);
            rounds = List.of(one);
        } else {
            rounds = visibleRounds(actor, entry, pieces);
        }
        if (rounds.isEmpty()) return;

        // Batched (one SELECT + one JDBC-batched save) rather than a find-then-save round trip per
        // round — an entry with several historical rounds (see markRead's javadoc) was doing that
        // many sequential DB round trips against the remote instance, a real contributor to "View
        // EOD"/the conversation panel feeling slow to open.
        List<Long> clarificationIds = rounds.stream().map(EodClarification::getId).toList();
        Map<Long, EodClarificationReadState> existingByClarification = readStateRepository
                .findByClarificationIdInAndUserId(clarificationIds, actor.getId()).stream()
                .collect(Collectors.toMap(s -> s.getClarification().getId(), s -> s));

        OffsetDateTime now = OffsetDateTime.now();
        List<EodClarificationReadState> toSave = rounds.stream().map(c -> {
            EodClarificationReadState state = existingByClarification.get(c.getId());
            if (state == null) {
                state = new EodClarificationReadState();
                state.setClarification(c);
                state.setUser(actor);
            }
            state.setLastReadAt(now);
            return state;
        }).toList();
        readStateRepository.saveAll(toSave);
    }

    private void markReadInternal(EodClarification clarification, AppUser actor) {
        EodClarificationReadState state = readStateRepository
                .findByClarificationIdAndUserId(clarification.getId(), actor.getId())
                .orElseGet(() -> {
                    EodClarificationReadState s = new EodClarificationReadState();
                    s.setClarification(clarification);
                    s.setUser(actor);
                    return s;
                });
        state.setLastReadAt(OffsetDateTime.now());
        readStateRepository.save(state);
    }

    public EodClarificationReplyDto reply(Long entryId, String actingEmail, String message, List<MultipartFile> files) {
        return reply(entryId, actingEmail, message, files, null);
    }

    /** Posts into one round: {@code clarificationId} when given (the employee's pick when two leads asked),
     *  otherwise the viewer's own open round. A lead can only post in the round on his own piece. */
    public EodClarificationReplyDto reply(Long entryId, String actingEmail, String message, List<MultipartFile> files,
                                           Long clarificationId) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanReply(actor, entry, pieces);

        EodClarification clarification = selectOpenRound(actor, entry, pieces, clarificationId, false);

        EodClarificationReply saved = saveReply(clarification, actor, message, files);

        // The reply itself already makes this round "not unread" for its own sender (the latest
        // message's sender always reads as caught-up — see EodInboxItemDto.from), but advance
        // last_read_at too so a later re-open of an older round still reflects having just replied.
        markReadInternal(clarification, actor);

        boolean actorIsEmployee = EodClarificationAccessPolicy.isOwningEmployee(actor, entry);

        // A TL reply is itself an acknowledgement — the TL has seen and responded to whatever the
        // employee last said, so NEEDS_RESPONSE (nobody's replied since it was opened/reopened)
        // auto-advances to ACKNOWLEDGED without waiting for a separate manual status-dropdown
        // change. Only NEEDS_RESPONSE moves; ACKNOWLEDGED already reflects this and RESOLVED can't
        // be replied into (see the findByEodEntryIdAndStatusNot lookup above).
        if (!actorIsEmployee && clarification.getStatus() == EodClarification.Status.NEEDS_RESPONSE) {
            clarification.setStatus(EodClarification.Status.ACKNOWLEDGED);
            clarificationRepository.save(clarification);
        }

        if (actorIsEmployee) {
            // Notify whoever holds the review NOW — the current approver / escalatee on each
            // pending piece — not just whoever opened the round, who may have been replaced since.
            // Falls back to the opener snapshot only when no current approver resolves (e.g. an
            // ADMIN_GROUP piece has no named approver).
            for (AppUser recipient : reviewerRecipients(clarification, entry, pieces)) {
                notificationService.send(recipient.getId(), "EOD_CLARIFICATION_REPLY",
                        "New reply on an EOD clarification",
                        actor.getFullName() + " replied on the clarification for their EOD entry ("
                                + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate())
                                + projectSuffix(clarification) + ").",
                        reviewerInboxLink(recipient, entry, pieces));
            }
        } else {
            notificationService.send(entry.getEmployee().getId(), "EOD_CLARIFICATION_REPLY",
                    actor.getFullName() + " replied to your clarification",
                    actor.getFullName() + " replied on the clarification for your EOD entry ("
                            + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate())
                            + projectSuffix(clarification) + ").",
                    "/employee/eod-inbox?highlight=" + entry.getId());
        }

        return EodClarificationReplyDto.from(saved, clarification, attachmentsFor(saved.getId()));
    }

    /** Editing/deleting is restricted to the reply's own sender — unlike read/reply access, which
     *  requireCanReply already unifies across the owning employee and owning TL, ownership of a
     *  specific message is still per-sender: either side can read the thread, but neither can
     *  touch a message the other one sent. */
    public void editReply(Long replyId, String actingEmail, String message) {
        AppUser actor = requireUser(actingEmail);
        EodClarificationReply reply = requireReply(replyId);
        EodEntry entry = reply.getClarification().getEodEntry();
        List<EodProjectApproval> pieces = currentPieces(entry.getId());
        EodClarificationAccessPolicy.requireCanReply(actor, entry, pieces);
        requireCanReadRound(actor, entry, reply.getClarification(), pieces);
        requireOwnReply(reply, actor);
        requireClarificationNotResolved(reply.getClarification());
        updateMessage(reply, message);
    }

    public void deleteReply(Long replyId, String actingEmail) {
        AppUser actor = requireUser(actingEmail);
        EodClarificationReply reply = requireReply(replyId);
        EodEntry entry = reply.getClarification().getEodEntry();
        List<EodProjectApproval> pieces = currentPieces(entry.getId());
        EodClarificationAccessPolicy.requireCanReply(actor, entry, pieces);
        requireCanReadRound(actor, entry, reply.getClarification(), pieces);
        requireOwnReply(reply, actor);
        requireClarificationNotResolved(reply.getClarification());
        deleteReplyInternal(reply);
    }

    /** Loads the raw bytes for one attachment — read access is the same EodClarificationAccessPolicy
     *  check as the thread itself (owning employee, owning TL, scoped PM, or Superadmin), so this
     *  one method covers all three roles' download endpoints rather than Blockers' role-split pair
     *  (getAttachmentForLead/getAttachmentForEmployee) — clarification read access was already
     *  unified across roles, unlike Blockers'. */
    @Transactional(readOnly = true)
    public EodClarificationReplyAttachment getAttachment(Long attachmentId, String actingEmail) {
        AppUser actor = requireUser(actingEmail);
        EodClarificationReplyAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        EodEntry entry = attachment.getReply().getClarification().getEodEntry();
        List<EodProjectApproval> pieces = currentPieces(entry.getId());
        EodClarificationAccessPolicy.requireCanRead(actor, entry, pieces);
        requireCanReadRound(actor, entry, attachment.getReply().getClarification(), pieces);
        return attachment;
    }

    /**
     * TL-only status dropdown — same 3 values and same change model as Blockers'
     * TeamLeadService.setBlockerStatus. RESOLVED is terminal for this round: once set, no further
     * status change or reply is accepted (see requireCanReply's caller, reply(), and the guard
     * below), and resolved_at/resolved_by are stamped only on this transition. A later
     * "Request Clarification" click opens a fresh round.
     */
    public EodClarificationStatusDto setStatus(Long entryId, String actingEmail, String status) {
        return setStatus(entryId, actingEmail, status, null);
    }

    /** Changes / resolves the viewer's own round only. Resolving it unblocks only that piece — another
     *  project's open round, and every piece's approval state, are untouched. */
    public EodClarificationStatusDto setStatus(Long entryId, String actingEmail, String status, Long clarificationId) {
        AppUser lead = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        List<EodProjectApproval> pieces = currentPieces(entryId);
        EodClarificationAccessPolicy.requireCanOpenOrResolve(lead, entry, pieces);

        EodClarification clarification = selectOpenRound(lead, entry, pieces, clarificationId, true);

        EodClarification.Status newStatus;
        try {
            newStatus = EodClarification.Status.valueOf(status == null ? "" : status);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "status must be one of NEEDS_RESPONSE, ACKNOWLEDGED, RESOLVED");
        }

        clarification.setStatus(newStatus);
        if (newStatus == EodClarification.Status.RESOLVED) {
            clarification.setResolvedAt(OffsetDateTime.now());
            clarification.setResolvedBy(lead);
        }
        clarificationRepository.save(clarification);

        if (newStatus == EodClarification.Status.RESOLVED) {
            notificationService.send(entry.getEmployee().getId(), "EOD_CLARIFICATION_RESOLVED",
                    "Clarification resolved",
                    "The clarification on your EOD entry for "
                            + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate())
                            + projectParen(clarification)
                            + " has been marked resolved. It is back in review.",
                    "/employee/eod-inbox?highlight=" + entry.getId());
        }

        return statusDto(clarification, lead, entry, pieces);
    }

    /** Reviewer inbox: rounds where the viewer is a current piece approver / escalated-to PM, plus
     *  rounds on entries whose frozen RM they are (visible read-only — see the repository query). */
    @Transactional(readOnly = true)
    public List<EodInboxItemDto> listForLead(String actingEmail, boolean open) {
        AppUser lead = requireUser(actingEmail);
        List<EodClarification> rows = open
                ? clarificationRepository.findOpenForReviewer(lead.getId())
                : clarificationRepository.findResolvedForReviewer(lead.getId());
        return enrich(excludeOwnEntries(rows, lead.getId()), lead.getId());
    }

    /** A reviewer-side list must never contain the viewer's OWN EOD, whatever the query returned:
     *  a user who is both employee and reviewer sees their own thread only in the employee view.
     *  The repository queries already exclude it; this keeps the invariant enforced (and unit
     *  testable) independent of them. */
    private static List<EodClarification> excludeOwnEntries(List<EodClarification> rows, Long viewerId) {
        return rows.stream()
                .filter(c -> !c.getEodEntry().getEmployee().getId().equals(viewerId))
                .toList();
    }

    /** The My Reporting Team inbox: rounds on entries whose frozen manager is the viewer (see the repository
     *  query for why a lead who is also the RM does not see the same thread twice). */
    @Transactional(readOnly = true)
    public List<EodInboxItemDto> listForReportingManager(String actingEmail, boolean open) {
        AppUser rm = requireUser(actingEmail);
        List<EodClarification> rows = open
                ? clarificationRepository.findOpenForReportingManager(rm.getId())
                : clarificationRepository.findResolvedForReportingManager(rm.getId());
        return enrich(excludeOwnEntries(rows, rm.getId()), rm.getId());
    }

    @Transactional(readOnly = true)
    public List<EodInboxItemDto> listForEmployee(String actingEmail, boolean open) {
        AppUser employee = requireUser(actingEmail);
        List<EodClarification> rows = open
                ? clarificationRepository.findByEodEntry_Employee_IdAndStatusNotOrderByOpenedAtDesc(employee.getId(), EodClarification.Status.RESOLVED)
                : clarificationRepository.findByEodEntry_Employee_IdAndStatusOrderByResolvedAtDesc(employee.getId(), EodClarification.Status.RESOLVED);
        return enrich(rows, employee.getId());
    }

    @Transactional(readOnly = true)
    public List<EodInboxItemDto> listForPm(String actingEmail, boolean open) {
        AppUser pm = requireUser(actingEmail);
        pmScopeService.requirePmScope(pm);
        List<EodClarification> rows = open
                ? clarificationRepository.findOpenByPmId(pm.getId())
                : clarificationRepository.findResolvedByPmId(pm.getId());
        return enrich(excludeOwnEntries(rows, pm.getId()), pm.getId());
    }

    // ── shared helpers ────────────────────────────────────────────────────────

    /** Current-cycle approval pieces (superseded_at IS NULL) — the single source of truth for who
     *  reviews this entry right now. */
    private List<EodProjectApproval> currentPieces(Long entryId) {
        return pieceRepository.findByEodEntryId(entryId);
    }

    private static boolean isOpenableStatus(EodEntry entry) {
        return entry.getStatus() == EodEntry.Status.SUBMITTED
                || entry.getStatus() == EodEntry.Status.PARTIALLY_APPROVED;
    }

    /** May the actor start a round of his own: an openable entry and a pending piece he reviews that has no open
     *  round yet (his own piece's round — another project's open round is not in the way). */
    private boolean canOpenNewRound(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (!isOpenableStatus(entry)) return false;
        return EodClarificationAccessPolicy.openablePieces(actor, entry, pieces).stream()
                .anyMatch(p -> !clarificationRepository.existsByPiece_IdAndStatusNot(p.getId(), EodClarification.Status.RESOLVED))
                && !clarificationRepository.existsByEodEntryIdAndPieceIsNullAndStatusNotAndOpenedBy_Id(
                        entry.getId(), EodClarification.Status.RESOLVED, actor.getId());
    }

    private EodClarificationStatusDto statusDto(EodClarification c, AppUser actor, EodEntry entry,
                                                 List<EodProjectApproval> pieces) {
        boolean open = c.isOpen();
        return EodClarificationStatusDto.from(c,
                !open && canOpenNewRound(actor, entry, pieces),
                open && EodClarificationAccessPolicy.canReplyRound(actor, entry, c, pieces),
                // Resolving is a reviewer action on the viewer's OWN round: the owner can reply but never resolve.
                open && EodClarificationAccessPolicy.canReviewRound(actor, entry, c, pieces));
    }

    private void requireCanReadRound(AppUser actor, EodEntry entry, EodClarification round, List<EodProjectApproval> pieces) {
        if (!EodClarificationAccessPolicy.canReadRound(actor, entry, round, pieces)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }

    /** ", SYNC" — which project's lead the round is about, for use inside an existing parenthesis. */
    private static String projectSuffix(EodClarification c) {
        return c.getPiece() != null && c.getPiece().getProject() != null ? ", " + c.getPiece().getProject().getName() : "";
    }

    /** " (SYNC)" — same, standing alone. */
    private static String projectParen(EodClarification c) {
        return c.getPiece() != null && c.getPiece().getProject() != null ? " (" + c.getPiece().getProject().getName() + ")" : "";
    }

    /** Who to ping when the employee replies: the approver and escalated-to PM of every PENDING
     *  piece (de-duplicated, never the owner). Falls back to the snapshotted opener approver, then
     *  the opener, so a reply is never silently dropped. */
    private List<AppUser> reviewerRecipients(EodClarification clarification, EodEntry entry,
                                              List<EodProjectApproval> pieces) {
        Map<Long, AppUser> byId = new java.util.LinkedHashMap<>();
        if (clarification.getPiece() == null) {
            // A legacy round belongs to its opener alone — never ping another project's lead about a thread
            // they cannot see.
            AppUser opener = clarification.getOpenedByApprover() != null
                    ? clarification.getOpenedByApprover() : clarification.getOpenedBy();
            if (opener != null && !opener.getId().equals(entry.getEmployee().getId())) {
                byId.put(opener.getId(), opener);
            }
            return new ArrayList<>(byId.values());
        }
        for (EodProjectApproval p : pieces) {
            if (p.getStatus() != EodProjectApproval.Status.PENDING) continue;
            // A per-piece round pings only the lead (and escalatee) of ITS piece — never another project's lead.
            if (clarification.getPiece() != null && !p.getId().equals(clarification.getPiece().getId())) continue;
            if (p.getApprover() != null) byId.putIfAbsent(p.getApprover().getId(), p.getApprover());
            if (p.getEscalatedTo() != null) byId.putIfAbsent(p.getEscalatedTo().getId(), p.getEscalatedTo());
        }
        byId.remove(entry.getEmployee().getId());
        if (byId.isEmpty()) {
            AppUser fallback = clarification.getOpenedByApprover() != null
                    ? clarification.getOpenedByApprover() : clarification.getOpenedBy();
            if (fallback != null && !fallback.getId().equals(entry.getEmployee().getId())) {
                byId.put(fallback.getId(), fallback);
            }
        }
        return new ArrayList<>(byId.values());
    }

    /** PMs work from /projects/eod-inbox; every other reviewer from /team/eod-inbox. */
    private static String reviewerInboxLink(AppUser recipient, EodEntry entry, List<EodProjectApproval> pieces) {
        // A reporting manager who holds the entry only as RM (no LEAD piece) works from My Reporting Team >
        // EOD Inbox; a lead from Team Inbox; a PM from the PM inbox.
        boolean holdsLeadPiece = pieces.stream().anyMatch(p ->
                p.getApproverType() == EodProjectApproval.ApproverType.LEAD
                        && p.getApprover() != null && p.getApprover().getId().equals(recipient.getId()));
        boolean holdsRmPiece = pieces.stream().anyMatch(p ->
                p.getApproverType() == EodProjectApproval.ApproverType.REPORTING_MANAGER
                        && p.getApprover() != null && p.getApprover().getId().equals(recipient.getId()));
        // By the capacity in which the recipient holds the entry — one user can be lead, RM and PM at once.
        boolean holdsPmCapacity = pieces.stream().anyMatch(p ->
                (p.getApproverType() == EodProjectApproval.ApproverType.PM
                        && p.getApprover() != null && p.getApprover().getId().equals(recipient.getId()))
                        || (p.getEscalatedTo() != null && p.getEscalatedTo().getId().equals(recipient.getId())));
        String base;
        if (holdsLeadPiece) {
            base = "/team/eod-inbox";
        } else if (holdsRmPiece) {
            base = "/my-reports/eod-inbox";
        } else if (holdsPmCapacity || recipient.getRole() == AppUser.Role.PM) {
            base = "/projects/eod-inbox";
        } else {
            base = "/team/eod-inbox";
        }
        return base + "?highlight=" + entry.getId();
    }

    /** Batch-attaches each row's project/category names, last message, and the viewer's own
     *  read state (for the unread/bold indicator), then re-sorts by last activity (last reply's
     *  createdAt, falling back to openedAt for a round with no replies yet — can happen now that
     *  Request Clarification opens an empty round, see open()) — the EOD Inbox card list is
     *  sorted by conversation activity, not by when the round opened. */
    private List<EodInboxItemDto> enrich(List<EodClarification> rows, Long viewerId) {
        if (rows.isEmpty()) return List.of();

        List<Long> clarificationIds = rows.stream().map(EodClarification::getId).toList();
        List<Long> entryIds = rows.stream().map(c -> c.getEodEntry().getId()).distinct().toList();

        List<EodClarificationReply> allReplies = replyRepository.findByClarificationIdInOrderByCreatedAtAsc(clarificationIds);

        Map<Long, EodClarificationReply> lastReplyByClarification = allReplies.stream()
                .collect(Collectors.toMap(r -> r.getClarification().getId(), r -> r, (first, later) -> later));

        Map<Long, Long> replyCountByClarification = allReplies.stream()
                .collect(Collectors.groupingBy(r -> r.getClarification().getId(), Collectors.counting()));

        Map<Long, List<String>> projectNamesByEntry = taskRepository.findProjectNamesByEntryIds(entryIds).stream()
                .collect(Collectors.groupingBy(EodTaskProjectNameRow::entryId,
                        Collectors.mapping(EodTaskProjectNameRow::projectName, distinctToList())));

        Map<Long, List<String>> categoryNamesByEntry = taskRepository.findCategoryNamesByEntryIds(entryIds).stream()
                .collect(Collectors.groupingBy(EodTaskCategoryNameRow::entryId,
                        Collectors.mapping(EodTaskCategoryNameRow::categoryName, distinctToList())));

        Map<Long, OffsetDateTime> lastReadAtByClarification = readStateRepository
                .findByClarificationIdInAndUserId(clarificationIds, viewerId).stream()
                .collect(Collectors.toMap(s -> s.getClarification().getId(), EodClarificationReadState::getLastReadAt));

        return rows.stream()
                .map(c -> EodInboxItemDto.from(
                        c,
                        projectNamesByEntry.getOrDefault(c.getEodEntry().getId(), List.of()),
                        categoryNamesByEntry.getOrDefault(c.getEodEntry().getId(), List.of()),
                        replyCountByClarification.getOrDefault(c.getId(), 0L).intValue(),
                        lastReplyByClarification.get(c.getId()),
                        viewerId,
                        lastReadAtByClarification.get(c.getId())
                ))
                .sorted(Comparator.comparing(EodInboxItemDto::lastMessageAt).reversed())
                .toList();
    }

    private static Collector<String, ?, List<String>> distinctToList() {
        return Collectors.collectingAndThen(Collectors.toCollection(LinkedHashSet::new), ArrayList::new);
    }

    private EodClarificationReply saveReply(EodClarification clarification, AppUser sender, String message) {
        return saveReply(clarification, sender, message, List.of());
    }

    /** Mirrors BlockerConversationService.saveReply's validation and storage exactly — same
     *  message-or-attachment rule, same per-reply cap, same type/size/storage-cap checks reusing
     *  EodAttachmentValidation — just against this feature's own EodClarificationReplyAttachment
     *  table instead of blocker_reply_attachment. */
    private EodClarificationReply saveReply(EodClarification clarification, AppUser sender, String message, List<MultipartFile> files) {
        List<MultipartFile> attachments = validatedAttachments(message, files);
        boolean hasMessage = message != null && !message.isBlank();
        EodClarificationReply reply = new EodClarificationReply();
        reply.setClarification(clarification);
        reply.setSender(sender);
        // message column is NOT NULL — an attachment-only reply stores empty string rather than null.
        reply.setMessage(hasMessage ? message.trim() : "");
        reply.setCreatedAt(OffsetDateTime.now());
        EodClarificationReply saved = replyRepository.save(reply);

        for (MultipartFile file : attachments) {
            EodClarificationReplyAttachment attachment = new EodClarificationReplyAttachment();
            attachment.setReply(saved);
            attachment.setFileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "file");
            attachment.setContentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream");
            attachment.setFileSize(file.getSize());
            try {
                attachment.setData(file.getBytes());
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read uploaded file");
            }
            attachment.setCreatedAt(OffsetDateTime.now());
            attachmentRepository.save(attachment);
        }

        return saved;
    }

    /** Message-or-attachment rule, per-reply cap, and type / size / storage-cap checks — mirrors
     *  BlockerConversationService.saveReply, reusing EodAttachmentValidation. Returns the non-empty
     *  files. Pure validation: touches nothing, so it can run before a round is created. */
    private List<MultipartFile> validatedAttachments(String message, List<MultipartFile> files) {
        List<MultipartFile> attachments = files == null ? List.of() : files.stream().filter(f -> !f.isEmpty()).toList();
        boolean hasMessage = message != null && !message.isBlank();
        if (!hasMessage && attachments.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Reply must include a message or at least one attachment");
        }
        if (attachments.size() > MAX_ATTACHMENTS_PER_REPLY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At most " + MAX_ATTACHMENTS_PER_REPLY + " attachments per reply");
        }
        long used = attachmentRepository.sumFileSize();
        for (MultipartFile file : attachments) {
            String validationError = EodAttachmentValidation.validate(
                    file.getOriginalFilename(), file.getContentType(), file.getSize(), maxFileSizeBytes);
            if (validationError != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, validationError);
            }
            if (EodAttachmentValidation.exceedsStorageCap(used, file.getSize(), maxTotalStorageBytes)) {
                throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE,
                        "Attachment storage is full. Contact your administrator to free up space or raise the limit.");
            }
            used += file.getSize();
        }
        return attachments;
    }

    private List<EodClarificationAttachmentDto> attachmentsFor(Long replyId) {
        return attachmentRepository.findMetaByReplyIds(List.of(replyId));
    }

    private Map<Long, List<EodClarificationAttachmentDto>> attachmentsByReplyId(List<EodClarificationReply> replies) {
        List<Long> replyIds = replies.stream().map(EodClarificationReply::getId).toList();
        if (replyIds.isEmpty()) return Map.of();
        return attachmentRepository.findMetaByReplyIds(replyIds).stream()
                .collect(Collectors.groupingBy(EodClarificationAttachmentDto::replyId));
    }

    private AppUser requireUser(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private EodEntry requireEntry(Long entryId) {
        return entryRepository.findWithDetailsById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "EOD entry not found"));
    }

    private EodClarificationReply requireReply(Long replyId) {
        return replyRepository.findById(replyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply not found"));
    }

    private void requireOwnReply(EodClarificationReply reply, AppUser actor) {
        if (!reply.getSender().getId().equals(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only edit or delete your own message");
        }
    }

    // Same terminal rule new replies already respect (see reply()'s findByEodEntryIdAndStatusNot
    // lookup) — a RESOLVED round's history stays fixed rather than editable/deletable after close.
    private void requireClarificationNotResolved(EodClarification clarification) {
        if (clarification.getStatus() == EodClarification.Status.RESOLVED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This clarification has been marked resolved. Editing is disabled.");
        }
    }

    private void updateMessage(EodClarificationReply reply, String message) {
        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message cannot be empty");
        }
        reply.setMessage(message.trim());
        replyRepository.save(reply);
    }

    // Attachments have no ON DELETE CASCADE (see V88) — deleted explicitly first so the reply
    // row's delete never hits a dangling FK from an attachment still pointing at it.
    private void deleteReplyInternal(EodClarificationReply reply) {
        attachmentRepository.deleteByReplyId(reply.getId());
        replyRepository.delete(reply);
    }
}
