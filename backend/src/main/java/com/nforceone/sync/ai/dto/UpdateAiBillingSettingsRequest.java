package com.nforceone.sync.ai.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record UpdateAiBillingSettingsRequest(
        @NotNull @DecimalMin("0") BigDecimal monthlyBudgetUsd,
        @NotNull @DecimalMin("0") BigDecimal promptCostPerMillionUsd,
        @NotNull @DecimalMin("0") BigDecimal completionCostPerMillionUsd,
        @NotNull @DecimalMin("0") BigDecimal embeddingCostPerMillionUsd
) {
}
