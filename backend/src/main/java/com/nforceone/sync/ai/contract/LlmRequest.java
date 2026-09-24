package com.nforceone.sync.ai.contract;

/**
 * A provider-neutral completion request. The caller (AiAssistantService) always supplies explicit
 * {@code maxTokens}/{@code temperature} from {@code AiProperties.mistral}, so there is no "0 means
 * default" sentinel here — unlike OneHR, where a caller-omitted 0 silently fell back to config and
 * made a genuine temperature of 0 impossible to request.
 */
public record LlmRequest(
        String systemPrompt,
        String userPrompt,
        int maxTokens,
        double temperature,
        boolean jsonMode
) {
}
