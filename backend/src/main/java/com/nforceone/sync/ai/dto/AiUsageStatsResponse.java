package com.nforceone.sync.ai.dto;

import java.util.List;

/** GET /api/ai-assistant/admin/usage-stats?days= — real provider calls/attempts and token telemetry. */
public record AiUsageStatsResponse(
        int days,
        long totalRequests,
        long totalTurns,
        long successCount,
        long errorCount,
        long totalPromptTokens,
        long totalCompletionTokens,
        long totalEmbeddingTokens,
        long totalTokens,
        double avgLatencyMs,
        List<AiUsageDailyPoint> daily,
        List<AiUsageBreakdownPoint> byErrorCode,
        List<AiUsageBreakdownPoint> byResponseType
) {
}
