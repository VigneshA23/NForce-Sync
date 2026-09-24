package com.nforceone.sync.ai.provider.mistral;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.EmbeddingProvider;
import com.nforceone.sync.ai.exception.AiProviderException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mistral's Embeddings API behind {@link EmbeddingProvider}. {@code mistral-embed} produces
 * 1024-dimension vectors, the width {@code KnowledgeIndexRepository.EMBEDDING_DIMENSIONS} and the
 * {@code ai_knowledge_chunk.embedding} column are pinned to.
 */
@Component
class MistralEmbeddingProvider implements EmbeddingProvider {

    /** Mistral's per-request input cap for this adapter; {@link #embedBatch} chunks larger lists. */
    private static final int MAX_BATCH_SIZE = 32;

    private final MistralHttpClient httpClient;
    private final AiProperties properties;

    // Per-thread, not a shared instance field — this bean is a singleton serving concurrent
    // requests, and each request's own thread needs its own "what did my last call cost" reading.
    private final ThreadLocal<CallInfo> lastCallInfo = ThreadLocal.withInitial(() -> CallInfo.NONE);

    MistralEmbeddingProvider(MistralHttpClient httpClient, AiProperties properties) {
        this.httpClient = httpClient;
        this.properties = properties;
    }

    @Override
    public String name() {
        return "mistral";
    }

    @Override
    public int dimensions() {
        return 1024;
    }

    @Override
    public float[] embed(String text, Instant deadline) throws AiProviderException {
        return embedBatch(List.of(text), deadline).get(0);
    }

    @Override
    public List<float[]> embedBatch(List<String> texts, Instant deadline) throws AiProviderException {
        if (texts.isEmpty()) {
            lastCallInfo.set(CallInfo.NONE);
            return List.of();
        }

        List<float[]> results = new ArrayList<>(texts.size());
        int totalAttempts = 0;
        int totalPromptTokens = 0;

        for (int start = 0; start < texts.size(); start += MAX_BATCH_SIZE) {
            List<String> chunk = texts.subList(start, Math.min(start + MAX_BATCH_SIZE, texts.size()));

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", properties.getMistral().getEmbedModel());
            body.put("input", chunk);

            MistralHttpClient.Result result = httpClient.postJson("/v1/embeddings", body, deadline);
            JsonNode root = result.body();
            JsonNode data = root.path("data");
            if (!data.isArray() || data.size() != chunk.size()) {
                throw new AiProviderException("Mistral embeddings returned " + data.size()
                        + " vectors for " + chunk.size() + " inputs");
            }
            for (JsonNode item : data) {
                results.add(toFloatArray(item.path("embedding")));
            }

            totalAttempts += result.attempts();
            totalPromptTokens += root.path("usage").path("prompt_tokens").asInt(0);
        }

        lastCallInfo.set(new CallInfo(totalAttempts, totalPromptTokens));
        return results;
    }

    @Override
    public CallInfo lastCallInfo() {
        return lastCallInfo.get();
    }

    private float[] toFloatArray(JsonNode vectorNode) {
        if (!vectorNode.isArray() || vectorNode.isEmpty()) {
            throw new AiProviderException("Mistral embeddings returned an empty vector");
        }
        float[] values = new float[vectorNode.size()];
        int i = 0;
        for (JsonNode component : vectorNode) {
            values[i++] = (float) component.asDouble();
        }
        if (values.length != dimensions()) {
            throw new AiProviderException("Mistral embeddings returned " + values.length
                    + "-dimension vectors, expected " + dimensions()
                    + " (embed-model=" + properties.getMistral().getEmbedModel() + ")");
        }
        return values;
    }
}
