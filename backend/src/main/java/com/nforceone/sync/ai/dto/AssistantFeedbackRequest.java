package com.nforceone.sync.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** POST /api/ai-assistant/feedback. {@code messageId} is optional — falls back to the caller's most recent turn in the conversation. */
public record AssistantFeedbackRequest(
        @NotBlank(message = "conversationId is required") String conversationId,
        Long messageId,
        @NotBlank(message = "rating is required") String rating,
        @Size(max = 1000) String comment
) {
}
