package com.nforceone.sync.ai.dto;

import java.time.Instant;
import java.util.List;

/**
 * GET /api/ai-assistant/health. Open to any authenticated user — it decides whether the frontend
 * launcher renders at all, so gating it further would make every user's first interaction a 403.
 * Exposes only safe operational state, never provider credentials.
 */
public record AssistantHealthResponse(
        boolean enabled,
        boolean indexReady,
        long indexedChunks,
        Instant lastIndexedAt,
        List<String> knowledgeSources,
        String llmProvider,
        String embeddingProvider,
        int embeddingDimensions,
        int maxMessageChars
) {
}
