package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodEntry;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

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
        OffsetDateTime   decidedAt
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
                e.getTasks().stream().map(EodTaskDto::from).toList(),
                reviewerComment,
                enrichment != null ? enrichment.escalated() : null,
                enrichment != null ? enrichment.tlInactivityHours() : null,
                enrichment != null ? enrichment.tlName() : null,
                enrichment != null ? enrichment.tlId() : null,
                enrichment != null ? enrichment.undertimeHours() : null,
                enrichment != null ? enrichment.isResubmission() : null,
                enrichment != null ? enrichment.decidedByName() : null,
                enrichment != null ? enrichment.decidedByRole() : null,
                enrichment != null ? enrichment.decidedAt() : null
        );
    }
}
