package com.nforceone.sync.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The single, Super-Admin-editable billing configuration row (V95's singleton pattern). Feeds an
 * internal cost estimate only — never the provider's actual invoice.
 */
@Entity
@Table(name = "ai_billing_settings")
@Getter
@Setter
public class AiBillingSettings {

    @Id
    private UUID id;

    @Column(name = "singleton", nullable = false)
    private boolean singleton = true;

    @Column(name = "monthly_budget_usd", nullable = false)
    private BigDecimal monthlyBudgetUsd;

    @Column(name = "prompt_cost_per_million_usd", nullable = false)
    private BigDecimal promptCostPerMillionUsd;

    @Column(name = "completion_cost_per_million_usd", nullable = false)
    private BigDecimal completionCostPerMillionUsd;

    @Column(name = "embedding_cost_per_million_usd", nullable = false)
    private BigDecimal embeddingCostPerMillionUsd;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
