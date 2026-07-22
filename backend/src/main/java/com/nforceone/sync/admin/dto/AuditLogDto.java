package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.AuditLog;

import java.time.OffsetDateTime;

public record AuditLogDto(
        Long id,
        String entityType,
        Long entityId,
        String action,
        Long actorId,
        String actorName,
        String beforeValue,
        String afterValue,
        OffsetDateTime occurredAt
) {
    public static AuditLogDto from(AuditLog log) {
        return new AuditLogDto(
                log.getId(),
                log.getEntityType(),
                log.getEntityId(),
                log.getAction(),
                log.getActor() != null ? log.getActor().getId()       : null,
                log.getActor() != null ? log.getActor().getFullName() : null,
                log.getBeforeValue(),
                log.getAfterValue(),
                log.getOccurredAt()
        );
    }
}
