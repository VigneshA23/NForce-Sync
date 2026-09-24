package com.nforceone.sync.ai.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record AiBillingSettingsResponse(
        BigDecimal monthlyBudgetUsd,
        BigDecimal promptCostPerMillionUsd,
        BigDecimal completionCostPerMillionUsd,
        BigDecimal embeddingCostPerMillionUsd,
        OffsetDateTime updatedAt
) {
}
