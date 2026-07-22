package com.nforceone.sync.auth;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;

@Entity
@Table(name = "audit_log")
@Getter
@Setter
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entity_type", nullable = false, length = 100)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private Long entityId;

    @Column(nullable = false, length = 100)
    private String action;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private AppUser actor;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before_value", columnDefinition = "jsonb")
    private String beforeValue;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "after_value", columnDefinition = "jsonb")
    private String afterValue;

    @Column(name = "occurred_at", nullable = false)
    private OffsetDateTime occurredAt;
}
