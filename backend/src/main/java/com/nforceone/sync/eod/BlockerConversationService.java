package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.BlockerAttachmentDto;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.notification.NotificationService;
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

    // Kept in sync with the client-side limits in BlockerThread.tsx (5 MB / 4 files) —
    // the frontend check is for immediate feedback, this one is the actual guarantee.
    private static final long MAX_ATTACHMENT_BYTES = 5L * 1024 * 1024;
    private static final int MAX_ATTACHMENTS_PER_REPLY = 4;

    private final BlockerReplyRepository replyRepository;
    private final BlockerReplyAttachmentRepository attachmentRepository;
    private final EodTaskRepository taskRepository;
    private final AppUserRepository userRepository;
    private final NotificationService notificationService;

    public BlockerConversationService(BlockerReplyRepository replyRepository,
                                       BlockerReplyAttachmentRepository attachmentRepository,
                                       EodTaskRepository taskRepository,
                                       AppUserRepository userRepository,
                                       NotificationService notificationService) {
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
                "Your Team Lead replied to your blocker",
                lead.getFullName() + " replied to your blocker: \"" + task.getDescription() + "\"",
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

        AppUser lead = task.getEodEntry().getEmployee().getManager();
        notificationService.send(lead.getId(), "BLOCKER_REPLY",
                "New reply on a blocker",
                employee.getFullName() + " replied to their blocker: \"" + task.getDescription() + "\"",
                "/team/blockers?highlight=" + task.getId());

        return BlockerReplyDto.from(saved, task, attachmentsFor(saved.getId()));
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
        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message must not be blank");
        }
        List<MultipartFile> attachments = files == null ? List.of() : files.stream().filter(f -> !f.isEmpty()).toList();
        if (attachments.size() > MAX_ATTACHMENTS_PER_REPLY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At most " + MAX_ATTACHMENTS_PER_REPLY + " attachments per reply");
        }
        for (MultipartFile file : attachments) {
            if (file.getSize() > MAX_ATTACHMENT_BYTES) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "\"" + file.getOriginalFilename() + "\" exceeds the 5 MB attachment limit");
            }
        }

        BlockerReply reply = new BlockerReply();
        reply.setTask(task);
        reply.setSender(sender);
        reply.setMessage(message.trim());
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

    private EodTask requireTask(Long taskId) {
        return taskRepository.findById(taskId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blocker not found"));
    }

    private void requireLeadOwnsTask(EodTask task, AppUser lead) {
        if (!task.getEodEntry().getEmployee().getManager().getId().equals(lead.getId())) {
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
}
