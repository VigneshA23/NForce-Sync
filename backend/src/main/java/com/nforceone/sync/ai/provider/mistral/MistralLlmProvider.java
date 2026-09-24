package com.nforceone.sync.ai.provider.mistral;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.LlmCompletion;
import com.nforceone.sync.ai.contract.LlmProvider;
import com.nforceone.sync.ai.contract.LlmRequest;
import com.nforceone.sync.ai.exception.AiProviderException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mistral's Chat Completions API behind {@link LlmProvider}. Nothing outside this package (and
 * {@code MistralHttpClient}, shared with the embedding adapter) knows this is Mistral — swapping
 * providers later means implementing {@link LlmProvider} in a new {@code ai/provider/<vendor>}
 * package, nothing else.
 */
@Component
class MistralLlmProvider implements LlmProvider {

    private final MistralHttpClient httpClient;
    private final AiProperties properties;

    MistralLlmProvider(MistralHttpClient httpClient, AiProperties properties) {
        this.httpClient = httpClient;
        this.properties = properties;
    }

    @Override
    public String name() {
        return "mistral";
    }

    @Override
    public LlmCompletion complete(LlmRequest request, Instant deadline) throws AiProviderException {
        AiProperties.Mistral cfg = properties.getMistral();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", cfg.getChatModel());
        body.put("messages", List.of(
                Map.of("role", "system", "content", request.systemPrompt()),
                Map.of("role", "user", "content", request.userPrompt())
        ));
        body.put("temperature", request.temperature());
        body.put("max_tokens", request.maxTokens());
        if (request.jsonMode()) {
            body.put("response_format", Map.of("type", "json_object"));
        }

        long startedAt = System.currentTimeMillis();
        MistralHttpClient.Result result = httpClient.postJson("/v1/chat/completions", body, deadline);
        long latencyMs = System.currentTimeMillis() - startedAt;

        JsonNode root = result.body();
        JsonNode choices = root.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            throw new AiProviderException("Mistral chat completion returned no choices");
        }
        String content = choices.path(0).path("message").path("content").asString("");
        if (content.isBlank()) {
            throw new AiProviderException("Mistral chat completion returned an empty message");
        }

        JsonNode usage = root.path("usage");
        int promptTokens = usage.path("prompt_tokens").asInt(0);
        int completionTokens = usage.path("completion_tokens").asInt(0);

        return new LlmCompletion(content, name(), cfg.getChatModel(), promptTokens, completionTokens,
                latencyMs, result.attempts());
    }
}
