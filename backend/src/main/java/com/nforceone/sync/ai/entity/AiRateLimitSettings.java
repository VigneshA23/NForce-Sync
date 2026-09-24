package com.nforceone.sync.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/** The single, Super-Admin-editable rate-limit configuration row (V95's singleton pattern). */
@Entity
@Table(name = "ai_rate_limit_settings")
@Getter
@Setter
public class AiRateLimitSettings {

    @Id
    private UUID id;

    @Column(name = "singleton", nullable = false)
    private boolean singleton = true;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "requests_per_window", nullable = false)
    private int requestsPerWindow;

    @Column(name = "window_minutes", nullable = false)
    private int windowMinutes;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
