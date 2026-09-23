package com.nforceone.sync.teamlead;

import com.nforceone.sync.eod.BlockerConversationService;
import com.nforceone.sync.eod.BlockerReplyAttachment;
import com.nforceone.sync.eod.EodClarificationReplyAttachment;
import com.nforceone.sync.eod.EodClarificationService;
import com.nforceone.sync.eod.dto.BlockerReplyDto;
import com.nforceone.sync.eod.dto.EodClarificationMessageRequest;
import com.nforceone.sync.eod.dto.EodClarificationReplyDto;
import com.nforceone.sync.eod.dto.EodClarificationStatusDto;
import com.nforceone.sync.eod.dto.EodClarificationStatusRequest;
import com.nforceone.sync.eod.dto.EodInboxItemDto;
import com.nforceone.sync.teamlead.dto.BlockerStatusRequest;
import com.nforceone.sync.teamlead.dto.DashboardTrendDto;
import com.nforceone.sync.teamlead.dto.MemberEodStatusDto;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
import com.nforceone.sync.teamlead.dto.TeamLeadSummaryDto;
import com.nforceone.sync.teamlead.dto.TeamMemberDetailDto;
import com.nforceone.sync.teamlead.dto.ThresholdsDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/team-lead")
public class TeamLeadController {

    private final TeamLeadService teamLeadService;
    private final BlockerConversationService conversationService;
    private final EodClarificationService clarificationService;

    public TeamLeadController(TeamLeadService teamLeadService, BlockerConversationService conversationService,
                               EodClarificationService clarificationService) {
        this.teamLeadService = teamLeadService;
        this.conversationService = conversationService;
        this.clarificationService = clarificationService;
    }

    @GetMapping("/dashboard/summary")
    public TeamLeadSummaryDto getSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long teamLeadId) {
        validateRange(from, to);
        return teamLeadService.getSummary(from, to, actingEmail(), teamLeadId);
    }

    @GetMapping("/team-members/status")
    public List<MemberEodStatusDto> getMemberStatuses(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long teamLeadId) {
        validateRange(from, to);
        return teamLeadService.getMemberStatuses(from, to, actingEmail(), teamLeadId);
    }

    @GetMapping("/blockers")
    public List<TeamBlockerDto> getBlockers(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean includeAcknowledged,
            @RequestParam(required = false) Long teamLeadId) {
        validateRange(from, to);
        return teamLeadService.getBlockers(from, to, actingEmail(), includeAcknowledged, teamLeadId);
    }

    @GetMapping("/blockers/{taskId}")
    public TeamBlockerDto getBlocker(@PathVariable Long taskId) {
        return teamLeadService.getBlockerById(taskId, actingEmail());
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'from' must not be after 'to'");
        }
    }

    @GetMapping("/dashboard/trend")
    public DashboardTrendDto getTrend(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(required = false) Long teamLeadId) {
        return teamLeadService.getTrend(date, days, actingEmail(), teamLeadId);
    }

    @GetMapping("/team-members/{employeeId}/detail")
    public TeamMemberDetailDto getMemberDetail(
            @PathVariable Long employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "7") int days,
            @RequestParam(required = false) Long teamLeadId) {
        if (days < 1 || days > 90) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'days' must be between 1 and 90");
        }
        return teamLeadService.getMemberDetail(employeeId, date, days, actingEmail(), teamLeadId);
    }

    @PatchMapping("/blockers/{taskId}/acknowledge")
    public TeamBlockerDto acknowledgeBlocker(@PathVariable Long taskId) {
        return teamLeadService.acknowledgeBlocker(taskId, actingEmail());
    }

    @PatchMapping("/blockers/{taskId}/status")
    public TeamBlockerDto setBlockerStatus(@PathVariable Long taskId, @RequestBody BlockerStatusRequest body) {
        return teamLeadService.setBlockerStatus(taskId, actingEmail(), body);
    }

    @GetMapping("/blockers/{taskId}/replies")
    public List<BlockerReplyDto> getBlockerReplies(@PathVariable Long taskId) {
        return conversationService.getThreadForLead(taskId, actingEmail());
    }

    @PostMapping(value = "/blockers/{taskId}/replies", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BlockerReplyDto postBlockerReply(
            @PathVariable Long taskId,
            @RequestParam String message,
            @RequestParam(required = false) List<MultipartFile> files) {
        return conversationService.postReplyAsLead(taskId, actingEmail(), message, files);
    }

    @GetMapping("/blockers/attachments/{attachmentId}")
    public ResponseEntity<byte[]> downloadBlockerAttachment(@PathVariable Long attachmentId) {
        BlockerReplyAttachment attachment = conversationService.getAttachmentForLead(attachmentId, actingEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getFileName() + "\"")
                .body(attachment.getData());
    }

    // ── EOD Inbox / Clarification ───────────────────────────────────────────

    @GetMapping("/eod-inbox")
    public List<EodInboxItemDto> getEodInbox(@RequestParam(defaultValue = "true") boolean open) {
        return clarificationService.listForLead(actingEmail(), open);
    }

    @GetMapping("/eod/{entryId}/clarification")
    public EodClarificationStatusDto getClarificationStatus(@PathVariable Long entryId) {
        return clarificationService.getStatus(entryId, actingEmail());
    }

    @GetMapping("/eod/{entryId}/clarification/replies")
    public List<EodClarificationReplyDto> getClarificationReplies(@PathVariable Long entryId) {
        return clarificationService.getThread(entryId, actingEmail());
    }

    // Opening the EOD Inbox row's conversation panel — marks the round read for this TL, clearing
    // the unread/bold indicator on the row (see EodClarificationService.markRead).
    @PostMapping("/eod/{entryId}/clarification/read")
    public void markClarificationRead(@PathVariable Long entryId) {
        clarificationService.markRead(entryId, actingEmail());
    }

    // Opens a new round — the Approvals detail popup's "Request Clarification" action. No message
    // required (matches Blockers' open-empty-thread-then-navigate pattern): the button just opens
    // the round and the TL is navigated to EOD Inbox to type the actual question there. A body is
    // still accepted (not @Valid — an empty/blank message is legal here, unlike a reply) so this
    // stays extensible if a caller ever wants to open with a first message in one call.
    @PostMapping("/eod/{entryId}/clarification")
    public EodClarificationStatusDto openClarification(
            @PathVariable Long entryId,
            @RequestBody(required = false) EodClarificationMessageRequest body) {
        return clarificationService.open(entryId, actingEmail(), body != null ? body.message() : null);
    }

    // Multipart, not JSON — matches Blockers' postBlockerReply exactly (message + files together),
    // now that clarification replies support attachments too (see EodClarificationService.reply).
    @PostMapping(value = "/eod/{entryId}/clarification/replies", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public EodClarificationReplyDto postClarificationReply(
            @PathVariable Long entryId,
            @RequestParam(required = false) String message,
            @RequestParam(required = false) List<MultipartFile> files) {
        return clarificationService.reply(entryId, actingEmail(), message, files);
    }

    @GetMapping("/eod/attachments/{attachmentId}")
    public ResponseEntity<byte[]> downloadClarificationAttachment(@PathVariable Long attachmentId) {
        EodClarificationReplyAttachment attachment = clarificationService.getAttachment(attachmentId, actingEmail());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getFileName() + "\"")
                .body(attachment.getData());
    }

    // TL-only status dropdown (NEEDS_RESPONSE / ACKNOWLEDGED / RESOLVED) — mirrors Blockers'
    // PATCH .../status, same shape as BlockerStatusRequest.
    @PatchMapping("/eod/{entryId}/clarification/status")
    public EodClarificationStatusDto setClarificationStatus(
            @PathVariable Long entryId,
            @RequestBody EodClarificationStatusRequest body) {
        return clarificationService.setStatus(entryId, actingEmail(), body.status());
    }

    // Reuses the existing Admin Config (business_rule_config) row — this just exposes the
    // subset Team Leads need, since /api/admin/business-rules/config is SUPERADMIN-only.
    @GetMapping("/thresholds")
    public ThresholdsDto getThresholds() {
        return teamLeadService.getThresholds();
    }

    private String actingEmail() {
        return (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }
}
