package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeType;

import java.util.Set;

/**
 * A chunk ready for embedding, before its vector exists. {@code embeddableText} (title + synonyms
 * + this piece's body — what gets embedded) is deliberately kept separate from {@code body} (the
 * clean, authored text only, what gets stored and shown in prompts): storing the composite text
 * would print the title twice in every prompt (title from its own field, then again as the first
 * line of a body that already contains it) — the bug this split fixes (I7 relative to OneHR,
 * which stores and reprints the composite text).
 *
 * <p>{@link KnowledgeIndexingService} embeds {@code embeddableText} via {@code EmbeddingProvider}
 * and combines the result with everything else here into a {@code KnowledgeChunk} the repository
 * can upsert.
 */
record ChunkDraft(
        String knowledgeId,
        int chunkOrdinal,
        KnowledgeType type,
        String module,
        String pageId,
        String sourceRef,
        int version,
        String contentHash,
        String title,
        String body,
        Set<String> audience,
        String embeddableText
) {
}
