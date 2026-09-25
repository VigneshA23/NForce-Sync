package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.BlockerAttachmentDto;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.notification.NotificationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Single shared thread per blocker (EodTask), readable/writable by both the reporting
 * employee and their Team Lead — there is no separate per-role copy of this data.
 *
 * Status rule ("last responder wins"): EodTask.acknowledgedAt/acknowledgedBy is
 * repurposed from a one-time flag into "timestamp/author of the most recent Team Lead
 * reply". A Team Lead reply sets it; a subsequent employee reply clears it back to null,
 * which re-flags the blocker as "Needs Response" on the Team Lead's Blockers page and KPIs.
 */
@Service
@Transactional
public class BlockerConversationService {

    // Per-reply attachment count is Blockers-specific; file type allowlist and per-file/total
    // storage limits are the same config-driven values EodAttachmentService uses (see
    // EodAttachmentValidation and application.yml's app.eod-attachment.*) — reused here rather
    // than a separate hardcoded set so size/type governance stays consistent app-wide.
    private static final int MAX_ATTACHMENTS_PER_REPLY = 4;

    private final long maxFileSizeBytes;
    private final long maxTotalStorageBytes;

    private final BlockerReplyRepository replyRepository;
    private final BlockerReplyAttachmentRepository attachmentRepository;
    private final EodTaskRepository taskRepository;
    private final AppUserRepository userRepository;
    private final NotificationService notificationService;

    public BlockerConversationService(@Value("${app.eod-attachment.max-file-size-bytes}") long maxFileSizeBytes,
                                       @Value("${app.eod-attachment.max-total-storage-bytes}") long maxTotalStorageBytes,
                                       BlockerReplyRepository replyRepository,
                                       BlockerReplyAttachmentRepository attachmentRepository,
                                       EodTaskRepository taskRepository,
                                       AppUserRepository userRepository,
                                       NotificationService notificationService) {
        this.maxFileSizeBytes = maxFileSizeBytes;
        this.maxTotalStorageBytes = maxTotalStorageBytes;
        this.replyRepository = replyRepository;
        this.attachmentRepository = attachmentRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    @Transactional(readOnly = true)
    public List<BlockerReplyDto> getThreadForLead(Long taskId, String actingEmail) {
        AppUser lead = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireLeadOwnsTask(task, lead);
        return loadThread(task);
    }

    public BlockerReplyDto postReplyAsLead(Long taskId, String actingEmail, String message, List<MultipartFile> files) {
        AppUser lead = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireLeadOwnsTask(task, lead);
        requireNotResolved(task);

        BlockerReply saved = saveReply(task, lead, message, files);

        task.setAcknowledgedAt(OffsetDateTime.now());
        task.setAcknowledgedBy(lead);
        taskRepository.save(task);

        AppUser employee = task.getEodEntry().getEmployee();
        notificationService.send(employee.getId(), "BLOCKER_REPLY",
                lead.getFullName() + " replied to your blocker",
                lead.getFullName() + " replied to your blocker: \"" + blockerLabel(task) + "\"",
                "/blockers?highlight=" + task.getId());

        return BlockerReplyDto.from(saved, task, attachmentsFor(saved.getId()));
    }

    @Transactional(readOnly = true)
    public List<BlockerReplyDto> getThreadForEmployee(Long taskId, String actingEmail) {
        AppUser employee = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireEmployeeOwnsTask(task, employee);
        return loadThread(task);
    }

    public BlockerReplyDto postReplyAsEmployee(Long taskId, String actingEmail, String message, List<MultipartFile> files) {
        AppUser employee = requireUser(actingEmail);
        EodTask task = requireTask(taskId);
        requireEmployeeOwnsTask(task, employee);
        requireNotResolved(task);

        BlockerReply saved = saveReply(task, employee, message, files);

        // Last-responder-wins: an employee follow-up re-opens the blocker for the Team Lead.
        task.setAcknowledgedAt(null);
        task.setAcknowledgedBy(null);
        taskRepository.save(task);

        Long leadId = task.getEodEntry().getManagerId();
        notificationService.send(leadId, "BLOCKER_REPLY",
                "New reply on a blocker",
                employee.getFullName() + " replied to their blocker: \"" + blockerLabel(task) + "\"",
                "/team/blockers?highlight=" + task.getId());

        return BlockerReplyDto.from(saved, task, attachmentsFor(saved.getId()));
    }

    // Edit/delete are restricted to the reply's own sender (never "any Team Lead"/"any
    // employee on the task") — requireOwnReply enforces that on top of the existing
    // requireLeadOwnsTask/requireEmployeeOwnsTask task-level access check.

    public void editReplyAsLead(Long replyId, String actingEmail, String message) {
        AppUser lead = requireUser(actingEmail);
        BlockerReply reply = requireReply(replyId);
        requireLeadOwnsTask(reply.getTask(), lead);
        requireOwnReply(reply, lead);
        requireNotResolved(reply.getTask());
        updateMessage(reply, message);
    }

    public void deleteReplyAsLead(Long replyId, String actingEmail) {
        AppUser lead = requireUser(actingEmail);
        BlockerReply reply = requireReply(replyId);
        requireLeadOwnsTask(reply.getTask(), lead);
        requireOwnReply(reply, lead);
        requireNotResolved(reply.getTask());
        deleteReplyInternal(reply);
    }

    public void editReplyAsEmployee(Long replyId, String actingEmail, String message) {
        AppUser employee = requireUser(actingEmail);
        BlockerReply reply = requireReply(replyId);
        requireEmployeeOwnsTask(reply.getTask(), employee);
        requireOwnReply(reply, employee);
        requireNotResolved(reply.getTask());
        updateMessage(reply, message);
    }

    public void deleteReplyAsEmployee(Long replyId, String actingEmail) {
        AppUser employee = requireUser(actingEmail);
        BlockerReply reply = requireReply(replyId);
        requireEmployeeOwnsTask(reply.getTask(), employee);
        requireOwnReply(reply, employee);
        requireNotResolved(reply.getTask());
        deleteReplyInternal(reply);
    }

    // Loads the raw bytes for one attachment, checking the caller owns the parent blocker
    // the same way reading/posting to its thread is checked — a Team Lead can download an
    // attachment only from a blocker belonging to one of their own reports, and an employee
    // only from one of their own blockers.
    @Transactional(readOnly = true)
    public BlockerReplyAttachment getAttachmentForLead(Long attachmentId, String actingEmail) {
        AppUser lead = requireUser(actingEmail);
        BlockerReplyAttachment attachment = requireAttachment(attachmentId);
        requireLeadOwnsTask(attachment.getReply().getTask(), lead);
        return attachment;
    }

    @Transactional(readOnly = true)
    public BlockerReplyAttachment getAttachmentForEmployee(Long attachmentId, String actingEmail) {
        AppUser employee = requireUser(actingEmail);
        BlockerReplyAttachment attachment = requireAttachment(attachmentId);
        requireEmployeeOwnsTask(attachment.getReply().getTask(), employee);
        return attachment;
    }

    // ── shared helpers ────────────────────────────────────────────────────────

    private List<BlockerReplyDto> loadThread(EodTask task) {
        List<BlockerReply> replies = replyRepository.findByTaskIdOrderByCreatedAtAsc(task.getId());
        List<Long> replyIds = replies.stream().map(BlockerReply::getId).toList();
        Map<Long, List<BlockerAttachmentDto>> byReplyId = replyIds.isEmpty()
                ? Map.of()
                : attachmentRepository.findMetaByReplyIds(replyIds).stream()
                        .collect(Collectors.groupingBy(BlockerAttachmentDto::replyId));
        return replies.stream()
                .map(r -> BlockerReplyDto.from(r, task, byReplyId.getOrDefault(r.getId(), List.of())))
                .toList();
    }

    private List<BlockerAttachmentDto> attachmentsFor(Long replyId) {
        return attachmentRepository.findMetaByReplyIds(List.of(replyId));
    }

    private BlockerReply saveReply(EodTask task, AppUser sender, String message, List<MultipartFile> files) {
        List<MultipartFile> attachments = files == null ? List.of() : files.stream().filter(f -> !f.isEmpty()).toList();
        boolean hasMessage = message != null && !message.isBlank();
        // A reply needs a message OR at least one attachment, not necessarily both — an
        // attachment-only reply (e.g. a screenshot with no comment) is a valid use case, and the
        // client's Send Reply button now allows it (see BlockerThread.tsx's `canSend`).
        if (!hasMessage && attachments.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Reply must include a message or at least one attachment");
        }
        if (attachments.size() > MAX_ATTACHMENTS_PER_REPLY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At most " + MAX_ATTACHMENTS_PER_REPLY + " attachments per reply");
        }
        // Type/size validation and the storage-capacity guard below reuse EodAttachmentValidation
        // (same allowlist, same configured limits) rather than duplicating the checks — see that
        // class for the exact rules. `used` is read once and advanced per accepted file so a
        // multi-file reply can't slip several individually-fine files past the total cap in one
        // request (mirrors EodAttachmentService.assertStorageAvailable's soft-backstop semantics).
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

        BlockerReply reply = new BlockerReply();
        reply.setTask(task);
        reply.setSender(sender);
        // message_column is NOT NULL — an attachment-only reply (hasMessage false, caught above
        // only when there's also no attachment) stores empty string rather than null.
        reply.setMessage(hasMessage ? message.trim() : "");
        reply.setCreatedAt(OffsetDateTime.now());
        BlockerReply saved = replyRepository.save(reply);

        for (MultipartFile file : attachments) {
            BlockerReplyAttachment attachment = new BlockerReplyAttachment();
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

    private BlockerReplyAttachment requireAttachment(Long attachmentId) {
        return attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
    }

    private BlockerReply requireReply(Long replyId) {
        return replyRepository.findById(replyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Reply not found"));
    }

    private void requireOwnReply(BlockerReply reply, AppUser actor) {
        if (!reply.getSender().getId().equals(actor.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only edit or delete your own message");
        }
    }

    private void updateMessage(BlockerReply reply, String message) {
        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message cannot be empty");
        }
        reply.setMessage(message.trim());
        replyRepository.save(reply);
    }

    // Attachments have no ON DELETE CASCADE (see V47) — deleted explicitly first so the reply
    // row's delete never hits a dangling FK from an attachment still pointing at it.
    private void deleteReplyInternal(BlockerReply reply) {
        attachmentRepository.deleteByReplyId(reply.getId());
        replyRepository.delete(reply);
    }

    private EodTask requireTask(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));
    }

    private void requireLeadOwnsTask(EodTask task, AppUser lead) {
        if (!task.getEodEntry().getManagerId().equals(lead.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }

    private void requireEmployeeOwnsTask(EodTask task, AppUser employee) {
        if (!task.getEodEntry().getEmployee().getId().equals(employee.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }

    // The conversation closes once a blocker is marked Resolved — enforced here so a stale
    // UI (disabled button bypassed, or a direct API call) can't still post into a closed thread.
    private void requireNotResolved(EodTask task) {
        if (task.getResolvedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This blocker has been marked resolved. Reply is disabled.");
        }
    }

    private AppUser requireUser(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    // task.getDescription() is a nullable free-text column — some legacy blockers have none,
    // which would otherwise surface as a literal "null" in the notification message.
    private static String blockerLabel(EodTask task) {
        String description = task.getDescription();
        return description == null || description.isBlank() ? "a blocker" : description;
    }
}
