package com.nforceone.sync.ai.contract;

import java.util.List;

/**
 * The Sync-owned response schema returned by POST /api/ai-assistant/chat, independent of Mistral.
 * Built exclusively by {@link com.nforceone.sync.ai.response.ResponseValidator} from the raw model
 * output — the model's JSON is never returned to the client verbatim, and any field the model
 * invents (e.g. an "action" or a raw URL) is dropped during validation, not merely ignored here.
 */
public record AssistantResponse(
        AssistantResponseType type,
        String answer,
        List<String> steps,
        NavigationAction navigation,
        List<RelatedItem> related,
        ConfidenceLevel confidence,
        String conversationId,
        Long messageId
) {
    public AssistantResponse {
        steps = steps == null ? List.of() : List.copyOf(steps);
        related = related == null ? List.of() : List.copyOf(related);
    }

    public AssistantResponse withConversationId(String newConversationId) {
        return new AssistantResponse(type, answer, steps, navigation, related, confidence, newConversationId, messageId);
    }

    public AssistantResponse withMessageId(Long newMessageId) {
        return new AssistantResponse(type, answer, steps, navigation, related, confidence, conversationId, newMessageId);
    }
}
