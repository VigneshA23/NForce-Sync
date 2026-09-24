package com.nforceone.sync.ai.provider.mistral;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.EmbeddingProvider;
import com.nforceone.sync.ai.contract.LlmCompletion;
import com.nforceone.sync.ai.contract.LlmRequest;
import com.nforceone.sync.ai.exception.AiProviderException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Exercises the real HTTP retry/deadline/parsing logic against a local {@link HttpServer} stub —
 * no mocking of {@code java.net.http.HttpClient} itself, so the actual request/response cycle,
 * retry-on-429/5xx behaviour, {@code Retry-After} handling and per-turn deadline enforcement are
 * all genuinely exercised, not merely asserted against a mock's configured behaviour.
 */
class MistralProviderTest {

    private static final String CHAT_COMPLETION_JSON = """
            {"choices":[{"message":{"role":"assistant","content":"%s"}}],
             "usage":{"prompt_tokens":42,"completion_tokens":7}}
            """;

    private HttpServer server;
    private AiProperties properties;
    private MistralHttpClient httpClient;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();

        properties = new AiProperties();
        properties.setEnabled(true);
        AiProperties.Mistral mistral = properties.getMistral();
        mistral.setApiKey("test-key");
        mistral.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        mistral.setChatModel("ministral-8b-latest");
        mistral.setEmbedModel("mistral-embed");
        mistral.setTimeoutSeconds(5);
        mistral.setConnectTimeoutSeconds(2);
        mistral.setMaxAttempts(3);
        mistral.setRetryBackoffMillis(10); // fast retries so the test suite stays quick
        mistral.setTemperature(0.2);
        mistral.setMaxTokens(1200);

        httpClient = new MistralHttpClient(properties, JsonMapper.builder().build());
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    // ---- chat completions ----------------------------------------------------------------

    @Test
    void completesOnFirstTry() {
        server.createContext("/v1/chat/completions", exchange ->
                respond(exchange, 200, CHAT_COMPLETION_JSON.formatted("Open the Submit EOD page.")));

        MistralLlmProvider provider = new MistralLlmProvider(httpClient, properties);
        LlmCompletion completion = provider.complete(
                new LlmRequest("system", "user question", 1200, 0.2, true),
                Instant.now().plusSeconds(30));

        assertEquals("Open the Submit EOD page.", completion.content());
        assertEquals("mistral", completion.provider());
        assertEquals(42, completion.promptTokens());
        assertEquals(7, completion.completionTokens());
        assertEquals(1, completion.attempts());
    }

    @Test
    void retriesOn500ThenSucceeds() {
        AtomicInteger calls = new AtomicInteger(0);
        server.createContext("/v1/chat/completions", exchange -> {
            if (calls.incrementAndGet() < 2) {
                respond(exchange, 500, "{\"error\":\"internal\"}");
            } else {
                respond(exchange, 200, CHAT_COMPLETION_JSON.formatted("Second try worked."));
            }
        });

        MistralLlmProvider provider = new MistralLlmProvider(httpClient, properties);
        LlmCompletion completion = provider.complete(
                new LlmRequest("system", "user question", 1200, 0.2, true),
                Instant.now().plusSeconds(30));

        assertEquals("Second try worked.", completion.content());
        assertEquals(2, completion.attempts());
        assertEquals(2, calls.get());
    }

    @Test
    void givesUpAfterMaxAttempts() {
        AtomicInteger calls = new AtomicInteger(0);
        server.createContext("/v1/chat/completions", exchange -> {
            calls.incrementAndGet();
            respond(exchange, 503, "{\"error\":\"unavailable\"}");
        });

        MistralLlmProvider provider = new MistralLlmProvider(httpClient, properties);
        assertThrows(AiProviderException.class, () -> provider.complete(
                new LlmRequest("system", "user question", 1200, 0.2, true),
                Instant.now().plusSeconds(30)));

        assertEquals(3, calls.get(), "should have tried exactly max-attempts times");
    }

    @Test
    void doesNotRetryNonRetryableStatus() {
        AtomicInteger calls = new AtomicInteger(0);
        server.createContext("/v1/chat/completions", exchange -> {
            calls.incrementAndGet();
            respond(exchange, 400, "{\"error\":\"bad request\"}");
        });

        MistralLlmProvider provider = new MistralLlmProvider(httpClient, properties);
        assertThrows(AiProviderException.class, () -> provider.complete(
                new LlmRequest("system", "user question", 1200, 0.2, true),
                Instant.now().plusSeconds(30)));

        assertEquals(1, calls.get(), "a 400 must not be retried");
    }

    @Test
    void honorsRetryAfterHeader() {
        AtomicInteger calls = new AtomicInteger(0);
        server.createContext("/v1/chat/completions", exchange -> {
            if (calls.incrementAndGet() < 2) {
                exchange.getResponseHeaders().add("Retry-After", "0");
                respond(exchange, 429, "{\"error\":\"rate limited\"}");
            } else {
                respond(exchange, 200, CHAT_COMPLETION_JSON.formatted("Recovered after 429."));
            }
        });

        MistralLlmProvider provider = new MistralLlmProvider(httpClient, properties);
        LlmCompletion completion = provider.complete(
                new LlmRequest("system", "user question", 1200, 0.2, true),
                Instant.now().plusSeconds(30));

        assertEquals("Recovered after 429.", completion.content());
    }

    @Test
    void abortsImmediatelyWhenDeadlineAlreadyPassed() {
        AtomicInteger calls = new AtomicInteger(0);
        server.createContext("/v1/chat/completions", exchange -> {
            calls.incrementAndGet();
            respond(exchange, 200, CHAT_COMPLETION_JSON.formatted("should never be seen"));
        });

        MistralLlmProvider provider = new MistralLlmProvider(httpClient, properties);
        Instant pastDeadline = Instant.now().minusSeconds(1);

        assertThrows(AiProviderException.class, () -> provider.complete(
                new LlmRequest("system", "user question", 1200, 0.2, true), pastDeadline));
        assertEquals(0, calls.get(), "no HTTP call should be made once the deadline has passed");
    }

    // ---- embeddings -------------------------------------------------------------------------

    @Test
    void embedsSingleTextWithCorrectDimensions() {
        server.createContext("/v1/embeddings", exchange -> {
            String vector = "[" + "0.01,".repeat(1023) + "0.02]";
            respond(exchange, 200, "{\"data\":[{\"index\":0,\"embedding\":" + vector + "}],"
                    + "\"usage\":{\"prompt_tokens\":5}}");
        });

        MistralEmbeddingProvider provider = new MistralEmbeddingProvider(httpClient, properties);
        float[] embedding = provider.embed("how do I submit my EOD", Instant.now().plusSeconds(30));

        assertEquals(1024, embedding.length);
        assertEquals(1024, provider.dimensions());
        assertEquals(1, provider.lastCallInfo().attempts());
        assertEquals(5, provider.lastCallInfo().promptTokens());
    }

    @Test
    void rejectsWrongDimensionVector() {
        server.createContext("/v1/embeddings", exchange ->
                respond(exchange, 200, "{\"data\":[{\"index\":0,\"embedding\":[0.1,0.2,0.3]}],"
                        + "\"usage\":{\"prompt_tokens\":3}}"));

        MistralEmbeddingProvider provider = new MistralEmbeddingProvider(httpClient, properties);
        assertThrows(AiProviderException.class,
                () -> provider.embed("short vector", Instant.now().plusSeconds(30)));
    }

    @Test
    void embedBatchChunksLargeInputs() {
        AtomicInteger calls = new AtomicInteger(0);
        server.createContext("/v1/embeddings", exchange -> {
            calls.incrementAndGet();
            String oneVector = "[" + "0.01,".repeat(1023) + "0.02]";
            // Echo back one vector per input actually sent in this request (each batch call may
            // carry fewer than 32 inputs, e.g. the final chunk of 50).
            StringBuilder data = new StringBuilder("[");
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            int inputCount = body.split("\"input\"")[1].split("]")[0].split(",").length;
            for (int i = 0; i < inputCount; i++) {
                if (i > 0) data.append(",");
                data.append("{\"index\":").append(i).append(",\"embedding\":").append(oneVector).append("}");
            }
            data.append("]");
            respond(exchange, 200, "{\"data\":" + data + ",\"usage\":{\"prompt_tokens\":1}}");
        });

        MistralEmbeddingProvider provider = new MistralEmbeddingProvider(httpClient, properties);
        List<String> texts = java.util.stream.IntStream.range(0, 50)
                .mapToObj(i -> "chunk " + i).toList();
        List<float[]> vectors = provider.embedBatch(texts, Instant.now().plusSeconds(30));

        assertEquals(50, vectors.size());
        assertEquals(2, calls.get(), "50 inputs at a max batch of 32 should take 2 HTTP calls");
        assertTrue(vectors.stream().allMatch(v -> v.length == 1024));
    }

    // ---- helpers ------------------------------------------------------------------------------

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
