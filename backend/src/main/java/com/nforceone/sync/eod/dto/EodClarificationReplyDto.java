package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodClarification;
import com.nforceone.sync.eod.EodClarificationReply;

import java.time.OffsetDateTime;
import java.util.List;

public record EodClarificationReplyDto(
        Long           id,
        Long           senderId,
        String         senderName,
        String         senderRole,   // "EMPLOYEE" | "TEAM_LEAD" — derived, not stored
        OffsetDateTime createdAt,
        String         message,
        List<EodClarificationAttachmentDto> attachments
) {
    public static EodClarificationReplyDto from(EodClarificationReply r, EodClarification clarification,
                                                 List<EodClarificationAttachmentDto> attachments) {
        boolean isEmployee = r.getSender().getId().equals(clarification.getEodEntry().getEmployee().getId());
        return new EodClarificationReplyDto(
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
