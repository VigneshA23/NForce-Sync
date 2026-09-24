package com.nforceone.sync.ai.contract;

import java.util.Set;

/**
 * A retrieval request. {@code audience} is the single caller role (Sync has no bucket set), and
 * an empty audience must always fail closed — never fall back to "visible to everyone".
 *
 * <p>This shape is deliberately reused at two layers with different field semantics, documented
 * here rather than duplicated into a second type:
 * <ul>
 *   <li><b>{@code KnowledgeRetriever.retrieve} (caller-facing, e.g. {@code AiAssistantService}):</b>
 *       {@code embedding} is {@code null} (not yet computed) and {@code topK} is the
 *       <i>final</i> number of results the caller wants back — {@code AiProperties.retrieval.topK}.</li>
 *   <li><b>{@code KnowledgeIndexRepository.search} (internal, called only by
 *       {@code VectorKnowledgeRetriever}):</b> {@code embedding} is populated, and {@code topK} is
 *       the <i>candidate</i> row count to fetch — {@code finalTopK × candidateMultiplier} — not
 *       the final count. The repository applies {@code minScore} and this limit in SQL;
 *       {@code VectorKnowledgeRetriever} then re-ranks with boosts, dedupes by knowledge unit,
 *       and trims back down to the final top-k and the context character budget.</li>
 * </ul>
 */
public record RetrievalQuery(
        String rawQuery,
        float[] embedding,
        Set<String> audience,
        String moduleHint,
        String pageIdHint,
        int topK,
        double minScore
) {
}
