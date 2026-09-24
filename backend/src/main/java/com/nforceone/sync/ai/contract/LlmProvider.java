package com.nforceone.sync.ai.contract;

import com.nforceone.sync.ai.exception.AiProviderException;

import java.time.Instant;

/** A chat-completion provider. The only implementation in v1 is Mistral (ai/provider/mistral). */
public interface LlmProvider {

    String name();

    /**
     * Completes the request. {@code deadline} bounds every retry this call makes — it is the
     * <b>remaining</b> time in the whole turn's budget (embedding call included), computed once
     * by {@code AiAssistantService} at the start of the turn and passed to both the retriever and
     * this provider, so retries on one call cannot silently exhaust the time the other needed.
     *
     * @throws AiProviderException on any failure (deadline exceeded, non-2xx after retries,
     *         malformed provider response). The caller degrades this to a controlled UNKNOWN response.
     */
    LlmCompletion complete(LlmRequest request, Instant deadline) throws AiProviderException;
}
