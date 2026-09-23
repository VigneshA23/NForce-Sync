package com.nforceone.sync.pmblockers;

import com.nforceone.sync.eod.EodClarificationReplyAttachment;
import com.nforceone.sync.eod.EodClarificationService;
import com.nforceone.sync.eod.dto.EodClarificationReplyDto;
import com.nforceone.sync.eod.dto.EodInboxItemDto;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Read-only, cross-team EOD Inbox view for Project Managers — no reply/resolve/request
 *  endpoints, same convention as {@code PmBlockersController} for Blockers. Scoped server-side
 *  to entries touching a project this PM owns (see EodClarificationRepository's PM queries). */
@RestController
@RequestMapping("/api/pm-eod-inbox")
@PreAuthorize("hasAnyRole('PM','SUPERADMIN')")
public class PmEodInboxController {

    private final EodClarificationService clarificationService;

    public PmEodInboxController(EodClarificationService clarificationService) {
        this.clarificationService = clarificationService;
    }

    @GetMapping
    public List<EodInboxItemDto> getInbox(@RequestParam(defaultValue = "true") boolean open) {
        return clarificationService.listForPm(actingEmail(), open);
    }

    // Read-only thread view — a PM can see what was discussed, just not reply (no POST endpoint
    // wired here at all, matching PmBlockersController's omission pattern).
    @GetMapping("/{entryId}/replies")
    public List<EodClarificationReplyDto> getReplies(@PathVariable Long entryId) {
        return clarificationService.getThread(entryId, actingEmail());
    }

    // Opening the EOD Inbox row's conversation panel — marks the round read for this PM (even
    // though they can't reply), clearing the unread/bold indicator on their own copy of the row.
    @PostMapping("/{entryId}/read")
    public void markRead(@PathVariable Long entryId) {
        clarificationService.markRead(entryId, actingEmail());
    }

    // Read-only download — same access check (EodClarificationAccessPolicy.requireCanRead) as
    // the thread itself, just surfaced under this read-only controller for the PM side.
    @GetMapping("/attachments/{attachmentId}")
    public ResponseEntity<byte[]> downloadAttachment(@PathVariable Long attachmentId) {
        EodClarificationReplyAttachment attachment = clarificationService.getAttachment(attachmentId, actingEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getFileName() + "\"")
                .body(attachment.getData());
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
