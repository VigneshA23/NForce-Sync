package com.nforceone.sync.ai.contract;

/** A completed LLM call, with enough telemetry for usage/billing accounting. */
public record LlmCompletion(
        String content,
        String provider,
        String model,
        int promptTokens,
        int completionTokens,
        long latencyMs,
        int attempts
) {
}
