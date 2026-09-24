package com.nforceone.sync.ai.dto;

import java.time.LocalDate;

public record AiUsageDailyPoint(
        LocalDate date,
        long requestCount,
        long successCount,
        long errorCount,
        long promptTokens,
        long completionTokens,
        long embeddingTokens
) {
}
