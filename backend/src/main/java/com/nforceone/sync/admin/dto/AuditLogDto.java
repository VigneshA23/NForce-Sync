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
        /** Raw AppUser.Role enum name (e.g. "ADMIN", "MANAGER") — the frontend maps this through
         *  its own ROLE_LABELS for the actor cell's role sub-label, same as everywhere else in the
         *  app that displays a role. Null for a system-initiated row with no actor. */
        String actorRole,
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
                log.getActor() != null ? log.getActor().getRole().name() : null,
                log.getBeforeValue(),
                log.getAfterValue(),
                log.getOccurredAt()
        );
    }
}
