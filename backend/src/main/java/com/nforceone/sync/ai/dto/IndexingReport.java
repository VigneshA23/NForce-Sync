package com.nforceone.sync.ai.dto;

import java.time.Instant;

/** Result of POST /api/ai-assistant/admin/reindex. */
public record IndexingReport(
        int documents,
        int chunks,
        int embedded,
        int reused,
        int removed,
        Instant startedAt,
        Instant finishedAt
) {
}
