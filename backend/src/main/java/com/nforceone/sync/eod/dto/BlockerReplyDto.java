package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.BlockerReply;
import com.nforceone.sync.eod.EodTask;

import java.time.OffsetDateTime;
import java.util.List;

public record BlockerReplyDto(
        Long                       id,
        Long                       senderId,
        String                     senderName,
        String                     senderRole,   // "EMPLOYEE" | "TEAM_LEAD" — derived, not stored
        OffsetDateTime             createdAt,
        String                     message,
        List<BlockerAttachmentDto> attachments
) {
    public static BlockerReplyDto from(BlockerReply r, EodTask task, List<BlockerAttachmentDto> attachments) {
        boolean isEmployee = r.getSender().getId().equals(task.getEodEntry().getEmployee().getId());
        return new BlockerReplyDto(
                r.getId(),
                r.getSender().getId(),
                r.getSender().getFullName(),
                isEmployee ? "EMPLOYEE" : "TEAM_LEAD",
                r.getCreatedAt(),
                r.getMessage(),
                attachments
        );
    }
}
