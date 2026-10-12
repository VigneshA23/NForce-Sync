package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.BlockerReply;
import com.nforceone.sync.eod.EodTask;

import java.time.OffsetDateTime;
import java.util.List;

public record BlockerReplyDto(
        Long                       id,
        Long                       senderId,
        String                     senderName,
        String                     senderRole,   // "EMPLOYEE" | "TEAM_LEAD" | "REPORTING_MANAGER" — derived, not stored
        OffsetDateTime             createdAt,
        String                     message,
        List<BlockerAttachmentDto> attachments
) {
    public static BlockerReplyDto from(BlockerReply r, EodTask task, List<BlockerAttachmentDto> attachments) {
        Long senderId = r.getSender().getId();
        boolean isEmployee = senderId.equals(task.getEodEntry().getEmployee().getId());
        // The entry's frozen reporting manager, when not also the blocker project's lead, replies as
        // the reporting manager — so a lead's own blocker handled by his RM isn't labelled "Team Lead".
        boolean isRm = !isEmployee
                && senderId.equals(task.getEodEntry().getManagerId())
                && !(task.getProject() != null && task.getProject().getLead() != null
                        && senderId.equals(task.getProject().getLead().getId()));
        return new BlockerReplyDto(
                r.getId(),
                senderId,
                r.getSender().getFullName(),
                isEmployee ? "EMPLOYEE" : isRm ? "REPORTING_MANAGER" : "TEAM_LEAD",
                r.getCreatedAt(),
                r.getMessage(),
                attachments
        );
    }
}
