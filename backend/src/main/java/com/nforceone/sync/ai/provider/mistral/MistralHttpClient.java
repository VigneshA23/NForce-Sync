package com.nforceone.sync.ai.provider.mistral;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.exception.AiProviderException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Low-level Mistral HTTP transport shared by {@link MistralLlmProvider} and
 * {@link MistralEmbeddingProvider} — the house pattern from {@code EmailService}
 * ({@code java.net.http.HttpClient}, no new dependency), extended with:
 * <ul>
 *   <li>retry only on 429 / 5xx / IOException, honouring a {@code Retry-After} header
 *       (improvement I14 over OneHR, which ignores it);</li>
 *   <li>a shared, caller-supplied per-turn deadline that bounds every retry across
 *       <i>both</i> the embedding call and the completion call in one chat turn, so a slow
 *       embedding call cannot silently eat the completion call's whole budget (also I14);</li>
 *   <li>attempt counting returned to the caller for usage/billing telemetry.</li>
 * </ul>
 */
@Component
class MistralHttpClient {

    private static final Logger log = LoggerFactory.getLogger(MistralHttpClient.class);

    private final AiProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    MistralHttpClient(AiProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(properties.getMistral().getConnectTimeoutSeconds()))
                .build();
    }

    /** The result of a (possibly retried) call: the parsed body plus how many attempts it took. */
    record Result(JsonNode body, int attempts) {
    }

    /**
     * POSTs {@code requestBody} as JSON to {@code path} under the configured base URL.
     *
     * @param deadline the remaining budget for this call (and any retries), or {@code null} for
     *                 "no shared deadline" (used only by the offline indexing pipeline).
     */
    Result postJson(String path, Map<String, Object> requestBody, Instant deadline) {
        AiProperties.Mistral cfg = properties.getMistral();
        String json;
        try {
            json = objectMapper.writeValueAsString(requestBody);
        } catch (JacksonException e) {
            throw new AiProviderException("Failed to serialize Mistral request body", e);
        }

        int maxAttempts = Math.max(1, cfg.getMaxAttempts());
        AiProviderException lastFailure = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            Duration remaining = remainingTimeout(deadline, cfg.getTimeoutSeconds());
            if (remaining.isZero() || remaining.isNegative()) {
                throw new AiProviderException(
                        "Mistral call aborted: turn deadline exceeded before attempt " + attempt, lastFailure);
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(cfg.getBaseUrl() + path))
                    .timeout(remaining)
                    .header("Authorization", "Bearer " + nullToEmpty(cfg.getApiKey()))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            try {
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                int status = response.statusCode();
                if (status >= 200 && status < 300) {
                    return new Result(objectMapper.readTree(response.body()), attempt);
                }
                lastFailure = new AiProviderException(
                        "Mistral returned HTTP " + status + ": " + truncate(response.body()));
                if (!isRetryable(status) || attempt == maxAttempts) {
                    throw lastFailure;
                }
                long delayMs = retryDelayMillis(response, cfg.getRetryBackoffMillis(), attempt);
                log.debug("Mistral {} returned HTTP {} on attempt {}/{}, retrying in {}ms",
                        path, status, attempt, maxAttempts, delayMs);
                sleepWithinDeadline(delayMs, deadline);
            } catch (IOException e) {
                lastFailure = new AiProviderException("Mistral request failed: " + e.getMessage(), e);
                if (attempt == maxAttempts) {
                    throw lastFailure;
                }
                log.debug("Mistral {} failed on attempt {}/{} ({}), retrying", path, attempt, maxAttempts, e.toString());
                sleepWithinDeadline(cfg.getRetryBackoffMillis() * attempt, deadline);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AiProviderException("Mistral request interrupted", e);
            } catch (JacksonException e) {
                // A 2xx response with a body we can't parse is not retryable — retrying would
                // just get the same malformed body again.
                throw new AiProviderException("Mistral returned a response we could not parse", e);
            }
        }
        // Unreachable: the loop above always either returns or throws.
        throw lastFailure != null ? lastFailure : new AiProviderException("Mistral request failed with no attempts made");
    }

    private static boolean isRetryable(int status) {
        return status == 429 || status >= 500;
    }

    private static long retryDelayMillis(HttpResponse<String> response, long configuredBackoffMillis, int attempt) {
        return response.headers().firstValue("Retry-After")
                .map(MistralHttpClient::parseRetryAfterSeconds)
                .map(seconds -> seconds * 1000L)
                .orElse(configuredBackoffMillis * attempt);
    }

    private static Long parseRetryAfterSeconds(String headerValue) {
        try {
            return Math.max(0, Long.parseLong(headerValue.trim()));
        } catch (NumberFormatException e) {
            // Retry-After may also be an HTTP-date; Mistral has not been observed to send one.
            // Falling back to the configured backoff is safe and simple rather than parsing RFC 1123.
            return null;
        }
    }

    /**
     * Sleeps for at most {@code requestedMs}, bounded so it never overshoots the shared deadline.
     * Wraps {@link InterruptedException} as an unchecked {@link AiProviderException} (restoring
     * the interrupt flag first) so every call site — including from inside another catch block,
     * where a checked exception's sibling catch clause would not apply — can call this without
     * its own try/catch.
     */
    private static void sleepWithinDeadline(long requestedMs, Instant deadline) {
        long boundedMs = requestedMs;
        if (deadline != null) {
            long remainingMs = Duration.between(Instant.now(), deadline).toMillis();
            if (remainingMs <= 0) {
                throw new AiProviderException("Mistral call aborted: turn deadline exceeded before a retry");
            }
            boundedMs = Math.min(boundedMs, remainingMs);
        }
        if (boundedMs > 0) {
            try {
                Thread.sleep(boundedMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AiProviderException("Mistral call interrupted while waiting to retry", e);
            }
        }
    }

    private static Duration remainingTimeout(Instant deadline, int configuredTimeoutSeconds) {
        Duration configured = Duration.ofSeconds(configuredTimeoutSeconds);
        if (deadline == null) {
            return configured;
        }
        Duration untilDeadline = Duration.between(Instant.now(), deadline);
        return untilDeadline.compareTo(configured) < 0 ? untilDeadline : configured;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static String truncate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() > 500 ? body.substring(0, 500) + "…" : body;
    }
}
