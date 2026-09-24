package com.nforceone.sync.ai.contract;

/**
 * One provider's read-only result for this turn, ready to be fenced into the prompt as
 * {@code <userdata>}. Produced by {@code AssistantDataService} (ai/data, built in M6); consumed
 * by {@code PromptBuilder} (ai/prompt, built in M5) — this shape is declared here so neither
 * package depends on the other's internals.
 */
public record LiveDataSection(String providerId, String title, String body) {
}
