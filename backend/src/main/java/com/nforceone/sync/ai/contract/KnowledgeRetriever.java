package com.nforceone.sync.ai.contract;

import com.nforceone.sync.ai.exception.AiProviderException;

import java.time.Instant;
import java.util.List;

/** Query embedding, kNN retrieval, boosting, dedup and context-budgeting behind one call. */
public interface KnowledgeRetriever {

    /**
     * @param deadline the remaining budget for this turn — see {@link LlmProvider#complete}.
     * @throws AiProviderException if embedding or the vector query fails — the caller degrades
     *         this to a controlled UNKNOWN ({@code RETRIEVAL_UNAVAILABLE}), never a 500.
     */
    List<RetrievalResult> retrieve(RetrievalQuery query, Instant deadline) throws AiProviderException;
}
