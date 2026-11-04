package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.BlockedTaskDto;
import com.nforceone.sync.eod.dto.EodAttachmentDto;
import com.nforceone.sync.eod.dto.EodDayDefaultsDto;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.eod.dto.TimeAdjustmentContextDto;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/eod")
public class EodController {

    private final EodService eodService;
    private final EodAttachmentService attachmentService;

    public EodController(EodService eodService, EodAttachmentService attachmentService) {
        this.eodService = eodService;
        this.attachmentService = attachmentService;
    }

    @PostMapping("/draft")
    @ResponseStatus(HttpStatus.OK)
    public EodEntryDto saveDraft(@Valid @RequestBody SaveEodRequest request) {
        return eodService.saveDraft(request, actingEmail());
    }

    /**
     * Records the day as a holiday with no Save Draft / Submit: no approval pieces, no notifications.
     * Idempotent — repeating it for the same date returns the same entry.
     */
    @PostMapping("/holiday")
    public EodEntryDto markHoliday(@Valid @RequestBody com.nforceone.sync.eod.dto.MarkHolidayRequest request) {
        return eodService.markHoliday(request, actingEmail());
    }

    /** Undoes an auto-recorded holiday (the user switched the Day Type away from Holiday). Idempotent. */
    @DeleteMapping("/holiday")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clearHoliday(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        eodService.clearHoliday(date, actingEmail());
    }

    @PostMapping("/{id}/submit")
    public EodEntryDto submit(@PathVariable Long id) {
        return eodService.submit(id, actingEmail());
    }

    @GetMapping
    public List<EodEntryDto> listEntries(
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            // Opt-in: adds synthetic MISSED rows for overdue days with no entry. Off by default so
            // callers that expect only real records (e.g. the Submit EOD form) are unaffected.
            @RequestParam(required = false, defaultValue = "false") boolean includeMissing) {
        return eodService.listEntries(employeeId, from, to, includeMissing, actingEmail());
    }

    @GetMapping("/{id}")
    public EodEntryDto getEntry(@PathVariable Long id) {
        return eodService.getEntry(id, actingEmail());
    }

    @GetMapping("/blocked")
    public List<BlockedTaskDto> getBlocked(@RequestParam Long managerId) {
        return eodService.getBlockedTasks(managerId, actingEmail());
    }

    /**
     * Shift timings, monthly allowances and current usage for the caller. Lives here rather
     * than under /api/admin/business-rules because that controller is SUPERADMIN-only and an
     * employee needs to read their own shift. Always scoped to the caller — no employeeId param.
     */
    @GetMapping("/time-adjustment-context")
    public TimeAdjustmentContextDto getTimeAdjustmentContext(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return eodService.getTimeAdjustmentContext(date, actingEmail());
    }

    /**
     * Day Type / Work Location defaults for the caller on a given date, so the Submit EOD form
     * can auto-populate those fields when the employee picks an Entry Date with no saved entry
     * yet. Scoped to the caller — no employeeId param, mirroring time-adjustment-context.
     */
    @GetMapping("/day-defaults")
    public EodDayDefaultsDto getDayDefaults(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return eodService.getDayDefaults(date, actingEmail());
    }

    /**
     * Upload one supporting file to an EOD entry, optionally scoped to one of its task rows.
     * `taskId` omitted/null = EOD-level attachment. Requires the entry to still be editable
     * (DRAFT/REJECTED) and to belong to the caller — see EodAttachmentService.upload.
     */
    @PostMapping(value = "/{entryId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public EodAttachmentDto uploadAttachment(
            @PathVariable Long entryId,
            @RequestParam(required = false) Long taskId,
            @RequestParam MultipartFile file) {
        return attachmentService.upload(entryId, taskId, file, actingEmail());
    }

    /** Removes an attachment before submission. Only the uploader, only while the entry is
     *  still editable — see EodAttachmentService.delete. */
    @DeleteMapping("/attachments/{attachmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAttachment(@PathVariable Long attachmentId) {
        attachmentService.delete(attachmentId, actingEmail());
    }

    /** Downloads one attachment's raw bytes. Authorization mirrors reading the entry itself —
     *  the entry's own employee, or a manager-tier role — never a public/unauthenticated URL. */
    @GetMapping("/attachments/{attachmentId}")
    public ResponseEntity<byte[]> downloadAttachment(@PathVariable Long attachmentId) {
        EodAttachment attachment = attachmentService.requireForDownload(attachmentId, actingEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getOriginalFileName() + "\"")
                .body(attachment.getData());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
