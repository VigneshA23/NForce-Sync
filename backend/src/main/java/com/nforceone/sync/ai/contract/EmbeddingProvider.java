package com.nforceone.sync.ai.contract;

import com.nforceone.sync.ai.exception.AiProviderException;

import java.time.Instant;
import java.util.List;

/** An embedding provider. The only implementation in v1 is Mistral (ai/provider/mistral). */
public interface EmbeddingProvider {

    String name();

    /** The real width of vectors this provider returns — validated against the schema before indexing. */
    int dimensions();

    /** {@code deadline} — see {@link LlmProvider#complete}; not used by the indexing pipeline, which passes {@code null} for "no deadline". */
    float[] embed(String text, Instant deadline) throws AiProviderException;

    /** Batched embedding (Mistral accepts up to 32 inputs per call in the current adapter). */
    List<float[]> embedBatch(List<String> texts, Instant deadline) throws AiProviderException;

    /** Telemetry for the most recent call on this thread, for usage/billing accounting. */
    record CallInfo(int attempts, int promptTokens) {
        public static final CallInfo NONE = new CallInfo(0, 0);
    }

    /**
     * Telemetry for the most recent {@link #embed} / {@link #embedBatch} call made <b>on the
     * calling thread</b> — implementations must store this per-thread (e.g. {@code ThreadLocal}),
     * never as a shared instance field, since the provider bean is a singleton serving concurrent
     * chat requests.
     */
    CallInfo lastCallInfo();
}
