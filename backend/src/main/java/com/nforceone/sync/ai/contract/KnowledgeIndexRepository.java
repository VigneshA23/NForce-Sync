package com.nforceone.sync.ai.contract;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * JDBC (never JPA) access to {@code ai_knowledge_chunk} / {@code ai_knowledge_chunk_audience}.
 * The vector column deliberately has no entity mapping — see
 * {@code PgVectorKnowledgeIndexRepository}'s class javadoc for why.
 */
public interface KnowledgeIndexRepository {

    /** mistral-embed's width. Indexing refuses to start if the configured provider disagrees. */
    int EMBEDDING_DIMENSIONS = 1024;

    /** Upserts on (knowledgeId, chunkOrdinal), including the embedding; replaces that chunk's audience rows. */
    void upsert(KnowledgeChunk chunk);

    void upsertAll(List<KnowledgeChunk> chunks);

    /**
     * Updates only classification/routing metadata (type, module, pageId, sourceRef, version) and
     * replaces audience rows — <b>does not touch title, body, embedding or content_hash</b>. Used
     * when {@code KnowledgeIndexingService} determines a unit's content is unchanged (same
     * content_hash), so its expensive embedding call can be skipped while metadata that can change
     * independently of content (e.g. widening {@code audience}) still stays current. A no-op if
     * the chunk does not already exist.
     */
    void upsertMetadataOnly(KnowledgeChunk chunk);

    /**
     * Deletes every chunk (all ordinals) for one knowledgeId — how {@code KnowledgeIndexingService}
     * removes a unit that existed in the index but is no longer produced by any source, without
     * touching any other unit's row (see that class for why a source-wide wipe-then-reinsert would
     * defeat embedding reuse).
     */
    int deleteByKnowledgeId(String knowledgeId);

    /**
     * Deletes every chunk whose {@code sourceRef} starts with the given prefix. General-purpose
     * (e.g. test cleanup, or wiping an entire source's data) — the normal reindex flow uses
     * {@link #deleteByKnowledgeId} instead, precisely so an in-place metadata update
     * ({@link #upsertMetadataOnly}) always has a row to find.
     */
    int deleteBySourceRefPrefix(String sourceRefPrefix);

    long count();

    Optional<Instant> lastIndexedAt();

    /** knowledgeId -> contentHash for every currently indexed chunk, used to skip re-embedding unchanged units. */
    Map<String, String> findContentHashes();

    List<RetrievalResult> search(RetrievalQuery query);
}
