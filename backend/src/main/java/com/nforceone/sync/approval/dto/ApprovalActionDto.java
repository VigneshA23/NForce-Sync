package com.nforceone.sync.approval.dto;

import com.nforceone.sync.approval.ApprovalAction;

import java.time.OffsetDateTime;

public record ApprovalActionDto(
        Long                   id,
        Long                   eodEntryId,
        Long                   actorId,
        String                 actorName,
        ApprovalAction.Action  action,
        String                 comment,
        OffsetDateTime         actedAt
) {
    public static ApprovalActionDto from(ApprovalAction a) {
        return new ApprovalActionDto(
                a.getId(),
                a.getEodEntry().getId(),
                a.getActor().getId(),
                a.getActor().getFullName(),
                a.getAction(),
                a.getComment(),
                a.getActedAt()
        );
    }
}
