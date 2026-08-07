package com.nforceone.sync.teamlead.dto;

import com.nforceone.sync.eod.BlockerReply;
import com.nforceone.sync.eod.EodTask;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public record TeamBlockerDto(
        Long           taskId,
        Long           entryId,
        Long           employeeId,
        String         employeeName,
        String         employeeCode,
        LocalDate      entryDate,
        String         projectCode,
        String         projectName,
        String         categoryName,
        String         description,
        BigDecimal     hours,
        String         blockerReason,
        String         supportNeeded,
        OffsetDateTime submittedAt,
        long           openHours,        // hours since submittedAt (0 if not yet submitted)
        boolean        acknowledged,
        OffsetDateTime acknowledgedAt,
        String         acknowledgedByName,
        String         status,              // "NEEDS_RESPONSE" | "ACKNOWLEDGED" | "RESOLVED"
        OffsetDateTime resolvedAt,
        String         resolvedByName,
        int            replyCount,          // total messages in the thread, either sender
        OffsetDateTime lastReplyAt,         // most recent message overall, or null if none
        String         lastReplySenderName,
        String         lastReplySenderRole  // "EMPLOYEE" | "TEAM_LEAD"
) {
    /** @param threadReplies this task's replies, any order — pass an empty list if none. */
    public static TeamBlockerDto from(EodTask t, List<BlockerReply> threadReplies) {
        var entry = t.getEodEntry();
        var emp   = entry.getEmployee();
        OffsetDateTime submittedAt = entry.getSubmittedAt();
        long openHours = submittedAt != null
                ? java.time.Duration.between(submittedAt, OffsetDateTime.now()).toHours()
                : 0;

        BlockerReply lastReply = threadReplies.stream()
                .max(java.util.Comparator.comparing(BlockerReply::getCreatedAt))
                .orElse(null);
        String lastReplyRole = lastReply != null
                ? (lastReply.getSender().getId().equals(emp.getId()) ? "EMPLOYEE" : "TEAM_LEAD")
                : null;

        return new TeamBlockerDto(
                t.getId(),
                entry.getId(),
                emp.getId(),
                emp.getFullName(),
                emp.getEmployeeCode(),
                entry.getEntryDate(),
                t.getProject()      != null ? t.getProject().getCode()     : null,
                t.getProject()      != null ? t.getProject().getName()      : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getName() : null,
                t.getDescription(),
                t.getHours(),
                t.getBlockerReason(),
                t.getSupportNeeded(),
                submittedAt,
                openHours,
                t.getAcknowledgedAt() != null,
                t.getAcknowledgedAt(),
                t.getAcknowledgedBy() != null ? t.getAcknowledgedBy().getFullName() : null,
                t.getBlockerStatus(),
                t.getResolvedAt(),
                t.getResolvedBy() != null ? t.getResolvedBy().getFullName() : null,
                threadReplies.size(),
                lastReply != null ? lastReply.getCreatedAt() : null,
                lastReply != null ? lastReply.getSender().getFullName() : null,
                lastReplyRole
        );
    }
}
