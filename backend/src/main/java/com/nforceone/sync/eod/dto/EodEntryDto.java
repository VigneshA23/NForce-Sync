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
        String           reviewerComment
) {
    // Default factory — no reviewer comment (used in approval flow, saveDraft, submit)
    public static EodEntryDto from(EodEntry e) {
        return from(e, null);
    }

    // Enriched factory — includes latest reviewer comment for REJECTED / CHANGES_REQUESTED
    public static EodEntryDto from(EodEntry e, String reviewerComment) {
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
                reviewerComment
        );
    }
}
