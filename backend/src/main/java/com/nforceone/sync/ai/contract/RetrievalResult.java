package com.nforceone.sync.ai.contract;

/** One retrieved, authorized knowledge chunk plus its final (post-boost) similarity score. */
public record RetrievalResult(
        String knowledgeId,
        int chunkOrdinal,
        KnowledgeType type,
        String module,
        String pageId,
        String sourceRef,
        String title,
        String body,
        double score
) {
}
