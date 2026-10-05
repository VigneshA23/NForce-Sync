package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.EodAttachmentDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Supporting-file attachments for an EOD entry or one of its task rows. Mirrors
 * BlockerConversationService's storage/validation approach (bytea in Postgres, MIME allowlist,
 * size cap) — see EodAttachment.data for why VARBINARY, not @Lob, is required.
 */
@Service
@Transactional
public class EodAttachmentService {

    private static final Map<String, String> EXTENSION_BY_CONTENT_TYPE = Map.ofEntries(
            Map.entry("image/png", ".png"),
            Map.entry("image/jpeg", ".jpg"),
            Map.entry("image/webp", ".webp"),
            Map.entry("application/pdf", ".pdf"),
            Map.entry("application/msword", ".doc"),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
            Map.entry("application/vnd.ms-excel", ".xls"),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx")
    );

    /** Change these in application.yml (app.eod-attachment.*), not here. */
    private final long maxFileSizeBytes;
    private final long maxTotalStorageBytes;
    private final int maxAttachmentsPerEntry;
    private final int maxAttachmentsPerTask;

    private final EodAttachmentRepository attachmentRepository;
    private final EodEntryRepository entryRepository;
    private final EodTaskRepository taskRepository;
    private final AppUserRepository userRepository;
    private final EodAccessPolicy accessPolicy;

    public EodAttachmentService(
            @Value("${app.eod-attachment.max-file-size-bytes}") long maxFileSizeBytes,
            @Value("${app.eod-attachment.max-total-storage-bytes}") long maxTotalStorageBytes,
            @Value("${app.eod-attachment.max-attachments-per-entry}") int maxAttachmentsPerEntry,
            @Value("${app.eod-attachment.max-attachments-per-task}") int maxAttachmentsPerTask,
            EodAttachmentRepository attachmentRepository,
            EodEntryRepository entryRepository,
            EodTaskRepository taskRepository,
            AppUserRepository userRepository,
            EodAccessPolicy accessPolicy) {
        this.maxFileSizeBytes = maxFileSizeBytes;
        this.maxTotalStorageBytes = maxTotalStorageBytes;
        this.maxAttachmentsPerEntry = maxAttachmentsPerEntry;
        this.maxAttachmentsPerTask = maxAttachmentsPerTask;
        this.attachmentRepository = attachmentRepository;
        this.entryRepository = entryRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.accessPolicy = accessPolicy;
    }

    public EodAttachmentDto upload(Long entryId, Long taskId, MultipartFile file, String actingEmail) {
        AppUser employee = requireUserByEmail(actingEmail);
        EodEntry entry = requireEntry(entryId);
        requireOwnerAndEditable(entry, employee);

        EodTask task = null;
        if (taskId != null) {
            task = taskRepository.findById(taskId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found"));
            // IDOR guard: a task ID that exists but belongs to a different entry must not be
            // usable to attach a file into someone else's EOD via this entry's own upload call.
            if (!task.getEodEntry().getId().equals(entryId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Task does not belong to this EOD entry");
            }
        }

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file provided");
        }
        // Never trust the client's declared type/name beyond this check — the stored filename
        // below is server-generated, and this is the sole gate on what content-type gets in.
        String validationError = EodAttachmentValidation.validate(
                file.getOriginalFilename(), file.getContentType(), file.getSize(), maxFileSizeBytes);
        if (validationError != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, validationError);
        }
        String normalizedType = file.getContentType().toLowerCase(Locale.ROOT);

        long existingCount = taskId != null
                ? attachmentRepository.countByTaskId(taskId)
                : attachmentRepository.countByEodEntryIdAndTaskIsNull(entryId);
        int cap = taskId != null ? maxAttachmentsPerTask : maxAttachmentsPerEntry;
        if (existingCount >= cap) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "At most " + cap + " attachments allowed " + (taskId != null ? "per task" : "per EOD entry"));
        }
        assertStorageAvailable(file.getSize());

        EodAttachment attachment = new EodAttachment();
        attachment.setEodEntry(entry);
        attachment.setTask(task);
        attachment.setOriginalFileName(safeName(file.getOriginalFilename()));
        attachment.setStoredFileName(UUID.randomUUID() + EXTENSION_BY_CONTENT_TYPE.getOrDefault(normalizedType, ""));
        attachment.setContentType(normalizedType);
        attachment.setFileSize(file.getSize());
        try {
            attachment.setData(file.getBytes());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read uploaded file");
        }
        attachment.setUploadedBy(employee);

        return EodAttachmentDto.from(attachmentRepository.save(attachment));
    }

    public void delete(Long attachmentId, String actingEmail) {
        AppUser employee = requireUserByEmail(actingEmail);
        EodAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        requireOwnerAndEditable(attachment.getEodEntry(), employee);
        if (!attachment.getUploadedBy().getId().equals(employee.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot delete another user's attachment");
        }
        attachmentRepository.delete(attachment);
    }

    @Transactional(readOnly = true)
    public EodAttachment requireForDownload(Long attachmentId, String actingEmail) {
        AppUser actor = requireUserByEmail(actingEmail);
        EodAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found"));
        if (!accessPolicy.canRead(actor, attachment.getEodEntry())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied to this attachment");
        }
        return attachment;
    }

    /**
     * Called from EodService.saveDraft right after the entry (and its freshly recreated task
     * rows) have been flushed. Re-points whichever attachment IDs the client says now belong to
     * the entry or each task, in request order zipped against {@code newTasksInOrder} — but only
     * among attachment rows already scoped to this exact {@code entryId}, fetched fresh in one
     * batch, so a client cannot smuggle in another entry's attachment ID and steal it.
     *
     * Safe to call with nothing to reassign. Entities are managed in the same persistence
     * context as the caller's transaction, so the mutations below flush on commit — no explicit
     * save() needed.
     */
    public void reassignForSave(Long entryId, List<Long> entryLevelAttachmentIds,
                                 List<List<Long>> perTaskAttachmentIds, List<EodTask> newTasksInOrder) {
        Set<Long> allIds = new HashSet<>();
        if (entryLevelAttachmentIds != null) allIds.addAll(entryLevelAttachmentIds);
        if (perTaskAttachmentIds != null) {
            perTaskAttachmentIds.forEach(ids -> { if (ids != null) allIds.addAll(ids); });
        }
        if (allIds.isEmpty()) return;

        Map<Long, EodAttachment> owned = attachmentRepository
                .findByIdInAndEodEntryId(new ArrayList<>(allIds), entryId).stream()
                .collect(Collectors.toMap(EodAttachment::getId, a -> a));

        if (entryLevelAttachmentIds != null) {
            for (Long id : entryLevelAttachmentIds) {
                EodAttachment a = owned.get(id);
                if (a != null) a.setTask(null);
            }
        }
        if (perTaskAttachmentIds != null) {
            for (int i = 0; i < perTaskAttachmentIds.size() && i < newTasksInOrder.size(); i++) {
                List<Long> ids = perTaskAttachmentIds.get(i);
                if (ids == null) continue;
                EodTask task = newTasksInOrder.get(i);
                for (Long id : ids) {
                    EodAttachment a = owned.get(id);
                    if (a != null) a.setTask(task);
                }
            }
        }
    }

    /** Batched attachment lookup for one or many entries at once — avoids N+1 the same way
     *  EodService.mapWithBatchedComments already batches reviewer comments. */
    @Transactional(readOnly = true)
    public AttachmentsByScope loadForEntries(List<Long> entryIds) {
        if (entryIds == null || entryIds.isEmpty()) return new AttachmentsByScope(Map.of(), Map.of());
        List<EodAttachmentRow> all = attachmentRepository.findByEodEntryIdIn(entryIds);
        Map<Long, List<EodAttachmentDto>> entryLevel = all.stream()
                .filter(a -> a.taskId() == null)
                .collect(Collectors.groupingBy(EodAttachmentRow::eodEntryId,
                        Collectors.mapping(EodAttachmentDto::from, Collectors.toList())));
        Map<Long, List<EodAttachmentDto>> byTask = all.stream()
                .filter(a -> a.taskId() != null)
                .collect(Collectors.groupingBy(EodAttachmentRow::taskId,
                        Collectors.mapping(EodAttachmentDto::from, Collectors.toList())));
        return new AttachmentsByScope(entryLevel, byTask);
    }

    public record AttachmentsByScope(
            Map<Long, List<EodAttachmentDto>> entryLevelByEntryId,
            Map<Long, List<EodAttachmentDto>> byTaskId
    ) {}

    // ── private helpers ─────────────────────────────────────────────

    /**
     * App-wide storage-protection guard, independent of the per-file and per-entry/per-task caps
     * above: those only bound one upload/one entry at a time and do nothing to stop the shared
     * store growing without limit across every employee over months of use. Checked read-only
     * (no lock on the running total), so this is a soft backstop, not a hard atomic quota — two
     * uploads landing in the same instant could both pass a check that's a few files stale and
     * push the total slightly over the configured cap. That's an acceptable trade-off for a
     * protective ceiling like this: exactness would need a DB-level lock/counter for a limit
     * that's meant to catch runaway growth, not police a byte-for-byte budget.
     */
    private void assertStorageAvailable(long incomingFileSize) {
        long used = attachmentRepository.sumFileSize();
        if (EodAttachmentValidation.exceedsStorageCap(used, incomingFileSize, maxTotalStorageBytes)) {
            throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE,
                    "Attachment storage is full. Contact your administrator to free up space or raise the limit.");
        }
    }

    private void requireOwnerAndEditable(EodEntry entry, AppUser employee) {
        if (!entry.getEmployee().getId().equals(employee.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied to this EOD entry");
        }
        if (!entry.isEditable()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Entry in status " + entry.getStatus() + " cannot be modified");
        }
    }

    private EodEntry requireEntry(Long id) {
        return entryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "EOD entry not found"));
    }

    private static String safeName(String name) {
        return name == null || name.isBlank() ? "file" : name;
    }

    private AppUser requireUserByEmail(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }
}
