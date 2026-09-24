package com.nforceone.sync.ai.contract;

import java.util.Set;

/**
 * One embeddable unit of a {@link KnowledgeDocument}. Sync authors one chunk per unit (see
 * {@code KnowledgeChunker}), so {@code chunkOrdinal} is almost always 0; a unit is only split
 * when its body exceeds the chunker's size backstop.
 *
 * <p>{@code embedding} is a plain {@code float[]} for direct interop with the pgvector text
 * literal builder in {@code PgVectorKnowledgeIndexRepository}. Two chunks are never compared by
 * value equality in this codebase, so the array-typed record component's identity-based
 * equals/hashCode is not a correctness concern here.
 */
public record KnowledgeChunk(
        String knowledgeId,
        int chunkOrdinal,
        KnowledgeType type,
        String module,
        String pageId,
        String sourceRef,
        int version,
        String contentHash,
        String embeddingModel,
        String title,
        String body,
        Set<String> audience,
        float[] embedding
) {
}
