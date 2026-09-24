package com.nforceone.sync.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * POST /api/ai-assistant/chat. Deliberately carries no role, permission, or user id field — the
 * authenticated principal is the only source of identity (see {@code AiAssistantController}).
 * {@code message} is capped generously here (well above {@code app.ai.limits.max-message-chars})
 * so an over-limit message gets the assistant's own controlled decline rather than a raw 400.
 */
public record AssistantChatRequest(
        @NotBlank(message = "Message is required") @Size(max = 8000) String message,
        String conversationId,
        String currentPageId
) {
}
