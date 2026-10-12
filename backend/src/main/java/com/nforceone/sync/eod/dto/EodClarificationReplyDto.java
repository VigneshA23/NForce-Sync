package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodClarification;
import com.nforceone.sync.eod.EodClarificationReply;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.ReviewerCapacity;
import com.nforceone.sync.project.Project;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;

public record EodClarificationReplyDto(
        Long           id,
        Long           senderId,
        String         senderName,
        String         senderRole,   // "EMPLOYEE" | "TEAM_LEAD" | "REPORTING_MANAGER" — derived, not stored
        String         senderLabel,  // capacity beside the name: "Team Lead" / "Reporting Manager" / account role
        OffsetDateTime createdAt,
        String         message,
        List<EodClarificationAttachmentDto> attachments
) {
    public static EodClarificationReplyDto from(EodClarificationReply r, EodClarification clarification,
                                                 List<EodClarificationAttachmentDto> attachments) {
        EodEntry entry = clarification.getEodEntry();
        List<Project> projects = entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull).distinct().toList();
        String label = ReviewerCapacity.label(r.getSender(), entry, projects);
        String role = ReviewerCapacity.EMPLOYEE.equals(label) ? "EMPLOYEE"
                : ReviewerCapacity.REPORTING_MANAGER.equals(label) ? "REPORTING_MANAGER" : "TEAM_LEAD";
        return new EodClarificationReplyDto(
                r.getId(),
                r.getSender().getId(),
                r.getSender().getFullName(),
                role,
                label,
                r.getCreatedAt(),
                r.getMessage(),
                attachments
        );
    }
}
