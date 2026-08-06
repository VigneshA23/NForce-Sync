package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.BlockerReply;
import com.nforceone.sync.eod.EodTask;

import java.time.OffsetDateTime;

public record BlockerReplyDto(
        Long           id,
        Long           senderId,
        String         senderName,
        String         senderRole,   // "EMPLOYEE" | "TEAM_LEAD" — derived, not stored
        OffsetDateTime createdAt,
        String         message
) {
    public static BlockerReplyDto from(BlockerReply r, EodTask task) {
        boolean isEmployee = r.getSender().getId().equals(task.getEodEntry().getEmployee().getId());
        return new BlockerReplyDto(
                r.getId(),
                r.getSender().getId(),
                r.getSender().getFullName(),
                isEmployee ? "EMPLOYEE" : "TEAM_LEAD",
                r.getCreatedAt(),
                r.getMessage()
        );
    }
}
