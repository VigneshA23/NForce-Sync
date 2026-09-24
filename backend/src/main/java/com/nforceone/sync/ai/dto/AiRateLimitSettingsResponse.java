package com.nforceone.sync.ai.dto;

import java.time.OffsetDateTime;

public record AiRateLimitSettingsResponse(
        boolean enabled,
        int requestsPerWindow,
        int windowMinutes,
        OffsetDateTime updatedAt
) {
}
