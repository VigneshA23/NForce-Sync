package com.nforceone.sync.admin;

import com.nforceone.sync.auth.AuditLog;
import jakarta.persistence.criteria.JoinType;
import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;
import java.util.List;

public final class AuditLogSpecs {

    private AuditLogSpecs() {}

    public static Specification<AuditLog> entityTypeIs(String entityType) {
        return (root, query, cb) ->
                entityType == null ? null : cb.equal(root.get("entityType"), entityType);
    }

    public static Specification<AuditLog> actionIs(String action) {
        return (root, query, cb) ->
                action == null ? null : cb.equal(root.get("action"), action);
    }

    public static Specification<AuditLog> actorIdIs(Long actorId) {
        return (root, query, cb) ->
                actorId == null ? null : cb.equal(root.get("actor").get("id"), actorId);
    }

    public static Specification<AuditLog> actorNameContains(String actorName) {
        return (root, query, cb) -> {
            if (actorName == null || actorName.isBlank()) return null;
            return cb.like(
                cb.lower(root.join("actor", JoinType.LEFT).<String>get("fullName")),
                "%" + actorName.toLowerCase() + "%"
            );
        };
    }

    public static Specification<AuditLog> occurredAfter(OffsetDateTime from) {
        return (root, query, cb) ->
                from == null ? null : cb.greaterThanOrEqualTo(root.get("occurredAt"), from);
    }

    public static Specification<AuditLog> occurredBefore(OffsetDateTime to) {
        return (root, query, cb) ->
                to == null ? null : cb.lessThanOrEqualTo(root.get("occurredAt"), to);
    }

    /**
     * Matches audit rows whose before/after JSON carries a "name" field equal to one of the given
     * values — the {@code {"name": ..., "value": ...}} shape written by BusinessRuleService's
     * ruleSnapshot(). Lets a caller (e.g. one Business Rules section) ask for its own latest audit
     * row directly, instead of paging through a shared, unfiltered list hoping its row is still
     * within the window.
     */
    public static Specification<AuditLog> entityNameIn(List<String> names) {
        return (root, query, cb) -> {
            if (names == null || names.isEmpty()) return null;
            var beforeName = cb.function("jsonb_extract_path_text", String.class, root.get("beforeValue"), cb.literal("name"));
            var afterName  = cb.function("jsonb_extract_path_text", String.class, root.get("afterValue"),  cb.literal("name"));
            return cb.or(beforeName.in(names), afterName.in(names));
        };
    }
}
