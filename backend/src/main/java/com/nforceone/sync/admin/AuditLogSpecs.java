package com.nforceone.sync.admin;

import com.nforceone.sync.auth.AuditLog;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;

public final class AuditLogSpecs {

    private AuditLogSpecs() {}

    public static Specification<AuditLog> entityTypeIs(String entityType) {
        return (root, query, cb) ->
                entityType == null ? null : cb.equal(root.get("entityType"), entityType);
    }

    public static Specification<AuditLog> actorIdIs(Long actorId) {
        return (root, query, cb) ->
                actorId == null ? null : cb.equal(root.get("actor").get("id"), actorId);
    }

    public static Specification<AuditLog> occurredAfter(OffsetDateTime from) {
        return (root, query, cb) ->
                from == null ? null : cb.greaterThanOrEqualTo(root.get("occurredAt"), from);
    }

    public static Specification<AuditLog> occurredBefore(OffsetDateTime to) {
        return (root, query, cb) ->
                to == null ? null : cb.lessThanOrEqualTo(root.get("occurredAt"), to);
    }
}
