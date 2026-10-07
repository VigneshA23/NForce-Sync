package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodEntry;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public record EodEntryDto(
        Long             id,
        Long             employeeId,
        String           employeeName,
        String             employeeCode,
        LocalDate        entryDate,
        String           status,
        String           dayType,
        String           timeAdjustmentType,
        Integer          timeAdjustmentMinutes,
        Boolean          isOvertime,
        BigDecimal       overtimeHours,
        String           workLocation,
        String           nextDayPlan,
        String           remarks,
        OffsetDateTime   submittedAt,
        OffsetDateTime   createdAt,
        OffsetDateTime   updatedAt,
        List<EodTaskDto> tasks,
        /** EOD-level attachments only (task-level ones live on their own EodTaskDto.attachments). */
        List<EodAttachmentDto> attachments,
        String           reviewerComment,
        Boolean          escalated,
        Integer          tlInactivityHours,
        String           tlName,
        Long             tlId,
        BigDecimal       undertimeHours,
        Boolean          isResubmission,
        /** Actor who last approved/rejected this entry, its role (TEAM_LEAD/PM/SUPERADMIN), and
         *  when — null while the entry is still SUBMITTED. Not scoped to any particular viewer:
         *  a Team Lead's own decided entries just show themself; a PM sees who really decided,
         *  which may be the entry's Team Lead rather than the PM. */
        String           decidedByName,
        String           decidedByRole,
        OffsetDateTime   decidedAt,
        // ── PLAIN_LOG fields (null for PROJECT_GROUPED entries) ──────────────────
        String           entryForm,
        String           logSummary,
        BigDecimal       logTotalHours,
        String           logNotes,
        // Approver name + type for the plain-log piece, populated for PLAIN_LOG entries only.
        String           logApproverName,
        String           logApproverType,
        // V110+ line items — empty for legacy PLAIN_LOG entries (frontend renders synthetic row).
        List<EodLogLineDto> logLines
) {
    // Default factory — no reviewer comment (used in approval flow, saveDraft, submit)
    public static EodEntryDto from(EodEntry e) {
        return from(e, null);
    }

    // Enriched factory — includes latest reviewer comment for REJECTED
    public static EodEntryDto from(EodEntry e, String reviewerComment) {
        return from(e, reviewerComment, null);
    }

    // PM-only factory — adds escalation/undertime/TL/resubmission enrichment computed by
    // ApprovalService. `enrichment` is null for every other caller, which is why the fields
    // above default to null/false there rather than requiring every call site to supply them.
    public static EodEntryDto from(EodEntry e, String reviewerComment, EodEntryEnrichment enrichment) {
        return from(e, reviewerComment, enrichment, List.of(), Map.of());
    }

    /**
     * Full factory — threads through pre-batch-fetched attachments and V110 log lines.
     * Callers that haven't been updated to supply logLines use the 3-arg overload, which passes
     * empty defaults — they render no attachments or log lines rather than N+1ing or failing.
     */
    public static EodEntryDto from(EodEntry e, String reviewerComment, EodEntryEnrichment enrichment,
                                    List<EodAttachmentDto> entryAttachments,
                                    Map<Long, List<EodAttachmentDto>> taskAttachmentsById) {
        return from(e, reviewerComment, enrichment, entryAttachments, taskAttachmentsById, List.of());
    }

    public static EodEntryDto from(EodEntry e, String reviewerComment, EodEntryEnrichment enrichment,
                                    List<EodAttachmentDto> entryAttachments,
                                    Map<Long, List<EodAttachmentDto>> taskAttachmentsById,
                                    List<EodLogLineDto> logLines) {
        return new EodEntryDto(
                e.getId(),
                e.getEmployee().getId(),
                e.getEmployee().getFullName(),
                e.getEmployee().getEmployeeCode(),
                e.getEntryDate(),
                e.getStatus().name(),
                e.getDayType() != null ? e.getDayType().name() : EodEntry.DayType.WORKING_DAY.name(),
                e.getTimeAdjustmentType() != null ? e.getTimeAdjustmentType().name() : null,
                e.getTimeAdjustmentMinutes(),
                Boolean.TRUE.equals(e.getIsOvertime()),
                e.getOvertimeHours(),
                e.getWorkLocation(),
                e.getNextDayPlan(),
                e.getRemarks(),
                e.getSubmittedAt(),
                e.getCreatedAt(),
                e.getUpdatedAt(),
                e.getTasks().stream()
                        .map(t -> EodTaskDto.from(t, taskAttachmentsById.getOrDefault(t.getId(), List.of())))
                        .toList(),
                entryAttachments != null ? entryAttachments : List.of(),
                reviewerComment,
                enrichment != null ? enrichment.escalated() : null,
                enrichment != null ? enrichment.tlInactivityHours() : null,
                enrichment != null ? enrichment.tlName() : null,
                enrichment != null ? enrichment.tlId() : null,
                enrichment != null ? enrichment.undertimeHours() : null,
                enrichment != null ? enrichment.isResubmission() : null,
                enrichment != null ? enrichment.decidedByName() : null,
                enrichment != null ? enrichment.decidedByRole() : null,
                enrichment != null ? enrichment.decidedAt() : null,
                // PLAIN_LOG fields
                e.getEntryForm() != null ? e.getEntryForm().name() : EodEntry.EntryForm.PROJECT_GROUPED.name(),
                e.getLogSummary(),
                e.getLogTotalHours(),
                e.getLogNotes(),
                null, // logApproverName — populated by ApprovalPieceService when needed
                null, // logApproverType
                logLines != null ? logLines : List.of()
        );
    }
}
