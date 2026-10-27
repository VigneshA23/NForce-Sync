package com.nforceone.sync.teamlead.dto;

import com.nforceone.sync.eod.BlockerReply;
import com.nforceone.sync.eod.BlockerSubject;

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
        String         lastReplySenderRole, // "EMPLOYEE" | "TEAM_LEAD"
        String         projectLeadName,     // the project's Team Lead, or null when it has none
        String         raisedOn             // "OWN_LEAD_PROJECT": raised by the lead of its own project (no other lead);
                                            // "OTHER_LEAD_PROJECT": raised on a project someone else leads; null: project has no lead
) {
    /** @param threadReplies this task's replies, any order — pass an empty list if none. */
    public static TeamBlockerDto from(BlockerSubject t, List<BlockerReply> threadReplies) {
        var entry = t.getBlockerEntry();
        var emp   = entry.getEmployee();
        OffsetDateTime submittedAt = entry.getSubmittedAt();
        long openHours = submittedAt != null
                ? java.time.Duration.between(submittedAt, OffsetDateTime.now()).toHours()
                : 0;

        var lead = t.getBlockerProject() != null ? t.getBlockerProject().getLead() : null;
        String raisedOn = lead == null ? null
                : lead.getId().equals(emp.getId()) ? "OWN_LEAD_PROJECT" : "OTHER_LEAD_PROJECT";

        BlockerReply lastReply = threadReplies.stream()
                .max(java.util.Comparator.comparing(BlockerReply::getCreatedAt))
                .orElse(null);
        String lastReplyRole = lastReply != null
                ? (lastReply.getSender().getId().equals(emp.getId()) ? "EMPLOYEE" : "TEAM_LEAD")
                : null;

        return new TeamBlockerDto(
                t.getBlockerKey(),
                entry.getId(),
                emp.getId(),
                emp.getFullName(),
                emp.getEmployeeCode(),
                entry.getEntryDate(),
                t.getBlockerProject() != null ? t.getBlockerProject().getCode() : null,
                t.getBlockerProject() != null ? t.getBlockerProject().getName() : null,
                t.getBlockerCategoryName(),
                t.getBlockerDescription(),
                t.getBlockerHours(),
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
                lastReplyRole,
                lead != null ? lead.getFullName() : null,
                raisedOn
        );
    }
}
