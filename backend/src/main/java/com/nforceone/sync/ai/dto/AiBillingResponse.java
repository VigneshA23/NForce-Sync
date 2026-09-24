package com.nforceone.sync.ai.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** GET /api/ai-assistant/admin/billing — an internal estimate, never the provider's actual invoice. */
public record AiBillingResponse(
        LocalDate monthStart,
        LocalDate today,
        long promptTokens,
        long completionTokens,
        long embeddingTokens,
        BigDecimal monthlyBudgetUsd,
        BigDecimal estimatedCostUsd,
        BigDecimal usedPercent
) {
}
