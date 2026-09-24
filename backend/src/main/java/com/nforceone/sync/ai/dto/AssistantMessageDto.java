package com.nforceone.sync.ai.dto;

import java.time.OffsetDateTime;

/** GET /api/ai-assistant/conversations/{id} — one transcript row. */
public record AssistantMessageDto(
        Long id,
        String sender,
        String content,
        String responseType,
        OffsetDateTime createdAt
) {
}
