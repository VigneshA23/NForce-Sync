package com.nforceone.sync.eod;

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

    public EodClarificationService(@Value("${app.eod-attachment.max-file-size-bytes}") long maxFileSizeBytes,
                                    @Value("${app.eod-attachment.max-total-storage-bytes}") long maxTotalStorageBytes,
                                    EodEntryRepository entryRepository,
                                    EodClarificationRepository clarificationRepository,
                                    EodClarificationReplyRepository replyRepository,
                                    EodClarificationReplyAttachmentRepository attachmentRepository,
                                    EodClarificationReadStateRepository readStateRepository,
                                    EodTaskRepository taskRepository,
                                    AppUserRepository userRepository,
                                    NotificationService notificationService) {
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
    }

    @Transactional(readOnly = true)
    public EodClarificationStatusDto getStatus(Long entryId, String actingEmail) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry);
        return clarificationRepository.findByEodEntryIdAndStatusNot(entryId, EodClarification.Status.RESOLVED)
                .map(EodClarificationStatusDto::from)
                .orElseGet(EodClarificationStatusDto::none);
    }

    @Transactional(readOnly = true)
    public List<EodClarificationReplyDto> getThread(Long entryId, String actingEmail) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry);
        // Only the latest round's thread is shown — see EodClarificationRepository's javadoc.
        return clarificationRepository.findFirstByEodEntryIdOrderByOpenedAtDesc(entryId)
                .map(c -> {
                    List<EodClarificationReply> replies = replyRepository.findByClarificationIdOrderByCreatedAtAsc(c.getId());
                    Map<Long, List<EodClarificationAttachmentDto>> byReplyId = attachmentsByReplyId(replies);
                    return replies.stream()
                            .map(r -> EodClarificationReplyDto.from(r, c, byReplyId.getOrDefault(r.getId(), List.of())))
                            .toList();
                })
                .orElse(List.of());
    }

    /** Opens a new round (Approvals' "Request Clarification" action). {@code message} is optional
     *  — the button opens an empty round and the TL is navigated to EOD Inbox to type the actual
     *  question there, same as opening a Blocker conversation doesn't require a first message
     *  either. A non-blank message is still accepted and saved as the opening reply for any other
     *  caller that wants to open-with-a-message in one call. */
    public EodClarificationStatusDto open(Long entryId, String actingEmail, String message) {
        AppUser lead = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        EodClarificationAccessPolicy.requireCanOpenOrResolve(lead, entry);

        if (entry.getStatus() != EodEntry.Status.SUBMITTED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Clarification can only be requested on a submitted entry; current status: " + entry.getStatus());
        }
        if (clarificationRepository.existsByEodEntryIdAndStatusNot(entryId, EodClarification.Status.RESOLVED)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A clarification is already open on this entry");
        }

        OffsetDateTime now = OffsetDateTime.now();
        EodClarification clarification = new EodClarification();
        clarification.setEodEntry(entry);
        clarification.setOpenedBy(lead);
        clarification.setOpenedAt(now);
        clarification.setStatus(EodClarification.Status.NEEDS_RESPONSE);
        clarification = clarificationRepository.save(clarification);

        if (message != null && !message.isBlank()) {
            saveReply(clarification, lead, message);
        }

        notificationService.send(entry.getEmployee().getId(), "EOD_CLARIFICATION_REQUESTED",
                "Clarification requested on your EOD entry",
                lead.getFullName() + " requested clarification on your EOD entry for "
                        + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate()) + ".",
                "/eod/history?highlight=" + entry.getId());

        return EodClarificationStatusDto.from(clarification);
    }

    /** Marks every clarification round against this entry as read by the caller (opening the EOD
     *  Inbox row's conversation panel) — same read-access check as getThread(). All of an entry's
     *  rounds, not just the latest: the EOD Inbox list shows each round as its own row, but every
     *  row for the same entry opens the exact same latest-round thread (getThread only ever
     *  returns the latest round), so a historical round has no other way to ever be marked read. */
    public void markRead(Long entryId, String actingEmail) {
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        EodClarificationAccessPolicy.requireCanRead(actor, entry);

        List<EodClarification> rounds = clarificationRepository.findByEodEntryId(entryId);
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
        AppUser actor = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        EodClarificationAccessPolicy.requireCanReply(actor, entry);

        EodClarification clarification = clarificationRepository
                .findByEodEntryIdAndStatusNot(entryId, EodClarification.Status.RESOLVED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "No open clarification on this entry"));

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
            Long leadId = entry.getManagerId();
            if (leadId != null) {
                notificationService.send(leadId, "EOD_CLARIFICATION_REPLY",
                        "New reply on an EOD clarification",
                        actor.getFullName() + " replied on the clarification for their EOD entry ("
                                + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate()) + ").",
                        "/team/eod-inbox?highlight=" + entry.getId());
            }
        } else {
            notificationService.send(entry.getEmployee().getId(), "EOD_CLARIFICATION_REPLY",
                    actor.getFullName() + " replied to your clarification",
                    actor.getFullName() + " replied on the clarification for your EOD entry ("
                            + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate()) + ").",
                    "/eod/history?highlight=" + entry.getId());
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
        EodClarificationAccessPolicy.requireCanReply(actor, entry);
        requireOwnReply(reply, actor);
        requireClarificationNotResolved(reply.getClarification());
        updateMessage(reply, message);
    }

    public void deleteReply(Long replyId, String actingEmail) {
        AppUser actor = requireUser(actingEmail);
        EodClarificationReply reply = requireReply(replyId);
        EodEntry entry = reply.getClarification().getEodEntry();
        EodClarificationAccessPolicy.requireCanReply(actor, entry);
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
        EodClarificationAccessPolicy.requireCanRead(actor, entry);
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
        AppUser lead = requireUser(actingEmail);
        EodEntry entry = requireEntry(entryId);
        EodClarificationAccessPolicy.requireCanOpenOrResolve(lead, entry);

        EodClarification clarification = clarificationRepository
                .findByEodEntryIdAndStatusNot(entryId, EodClarification.Status.RESOLVED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "No open clarification on this entry"));

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
                            + " has been marked resolved. It is back in review.",
                    "/eod/history?highlight=" + entry.getId());
        }

        return EodClarificationStatusDto.from(clarification);
    }

    @Transactional(readOnly = true)
    public List<EodInboxItemDto> listForLead(String actingEmail, boolean open) {
        AppUser lead = requireUser(actingEmail);
        List<EodClarification> rows = open
                ? clarificationRepository.findByEodEntry_ManagerIdAndStatusNotOrderByOpenedAtDesc(lead.getId(), EodClarification.Status.RESOLVED)
                : clarificationRepository.findByEodEntry_ManagerIdAndStatusOrderByResolvedAtDesc(lead.getId(), EodClarification.Status.RESOLVED);
        return enrich(rows, lead.getId());
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
        if (pm.getRole() != AppUser.Role.PM && pm.getRole() != AppUser.Role.SUPERADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Project Manager access required");
        }
        List<EodClarification> rows = open
                ? clarificationRepository.findOpenByProjectManagerId(pm.getId())
                : clarificationRepository.findResolvedByProjectManagerId(pm.getId());
        return enrich(rows, pm.getId());
    }

    // ── shared helpers ────────────────────────────────────────────────────────

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

        EodClarificationReply reply = new EodClarificationReply();
        reply.setClarification(clarification);
        reply.setSender(sender);
        // message column is NOT NULL — an attachment-only reply (hasMessage false, caught above
        // only when there's also no attachment) stores empty string rather than null.
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
