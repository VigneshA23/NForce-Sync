package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.EmbeddingProvider;
import com.nforceone.sync.ai.contract.KnowledgeChunk;
import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.contract.KnowledgeIndexRepository;
import com.nforceone.sync.ai.dto.IndexingReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A full-rebuild reindex, run only from {@code POST /admin/reindex} — never on startup or a
 * schedule, so a normal Sync boot never depends on Mistral being reachable.
 *
 * <p><b>Algorithm</b> (all inside one {@code @Transactional} boundary — improvement I1 over
 * OneHR, where deletes committed separately from upserts and a failure mid-rebuild could leave
 * the index empty):
 * <ol>
 *   <li>Load every {@link KnowledgeSource}, validate the combined set with
 *       {@link KnowledgeSchemaValidator} <i>before writing anything</i> — a broken unit in one
 *       file must not corrupt an otherwise-good index.</li>
 *   <li>Assert the configured {@link EmbeddingProvider}'s width matches
 *       {@link KnowledgeIndexRepository#EMBEDDING_DIMENSIONS}. A mismatch would leave every
 *       similarity score as noise without anything looking obviously broken.</li>
 *   <li>Chunk every document, and split into "content unchanged" (same {@code contentHash} as
 *       what is currently indexed) vs "new or changed".</li>
 *   <li>Unchanged chunks skip the (real-money) embedding call entirely and only get their
 *       classification metadata refreshed in place ({@link KnowledgeIndexRepository#upsertMetadataOnly}
 *       — improvement I2 over OneHR, which re-embeds every chunk on every run regardless of
 *       whether its content changed).</li>
 *   <li>New/changed chunks are embedded (batched) and fully upserted.</li>
 *   <li>Any knowledgeId indexed before but produced by no source now is removed by id (not by a
 *       source-wide wipe, which would destroy the rows step 4 needs to find in place).</li>
 *   <li>If the combined document set is empty, nothing is deleted and the existing index is left
 *       exactly as it was — a config mistake that makes every source return nothing must not wipe
 *       a working index.</li>
 * </ol>
 *
 * <p>A single-flight {@link AtomicBoolean} guard rejects a concurrent reindex request rather than
 * letting two rebuilds race each other's deletes and upserts.
 */
@Service
public class KnowledgeIndexingService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIndexingService.class);

    private final List<KnowledgeSource> sources;
    private final KnowledgeSchemaValidator schemaValidator;
    private final KnowledgeChunker chunker;
    private final EmbeddingProvider embeddingProvider;
    private final KnowledgeIndexRepository indexRepository;
    private final AiProperties properties;

    private final AtomicBoolean reindexing = new AtomicBoolean(false);

    public KnowledgeIndexingService(List<KnowledgeSource> sources, KnowledgeSchemaValidator schemaValidator,
            KnowledgeChunker chunker, EmbeddingProvider embeddingProvider,
            KnowledgeIndexRepository indexRepository, AiProperties properties) {
        this.sources = sources;
        this.schemaValidator = schemaValidator;
        this.chunker = chunker;
        this.embeddingProvider = embeddingProvider;
        this.indexRepository = indexRepository;
        this.properties = properties;
    }

    // @Transactional must sit on this public method, not the package-private doReindex() below:
    // Spring's proxy-based AOP only intercepts public method calls through the bean's proxy, so
    // annotating a package-private method would silently do nothing — the single most important
    // guarantee this class makes (I1: one atomic transaction) depends on getting this right.
    @Transactional
    public IndexingReport reindex() {
        if (!reindexing.compareAndSet(false, true)) {
            throw new IllegalStateException("A reindex is already running. Try again shortly.");
        }
        try {
            return doReindex();
        } finally {
            reindexing.set(false);
        }
    }

    private IndexingReport doReindex() {
        Instant startedAt = Instant.now();

        int providerDimensions = embeddingProvider.dimensions();
        if (providerDimensions != KnowledgeIndexRepository.EMBEDDING_DIMENSIONS) {
            throw new IllegalStateException("Embedding provider '" + embeddingProvider.name() + "' produces "
                    + providerDimensions + "-dimension vectors, but the index column is "
                    + KnowledgeIndexRepository.EMBEDDING_DIMENSIONS + "-dimension. Refusing to index — "
                    + "changing the embed model requires a migration and a full re-index from scratch.");
        }

        List<KnowledgeDocument> documents = new ArrayList<>();
        for (KnowledgeSource source : sources) {
            documents.addAll(source.load());
        }
        // Validates the WHOLE set before anything below writes a single row — a broken unit in
        // one file must not corrupt an otherwise-good index.
        schemaValidator.validate(documents);

        if (documents.isEmpty()) {
            log.warn("Reindex found zero knowledge documents across {} source(s); leaving the existing index untouched.",
                    sources.size());
            return new IndexingReport(0, 0, 0, 0, 0, startedAt, Instant.now());
        }

        Map<String, String> existingHashes = indexRepository.findContentHashes();
        Set<String> currentKnowledgeIds = new HashSet<>();

        List<ChunkDraft> unchangedDrafts = new ArrayList<>();
        List<ChunkDraft> changedDrafts = new ArrayList<>();

        for (KnowledgeDocument doc : documents) {
            currentKnowledgeIds.add(doc.knowledgeId());
            List<ChunkDraft> drafts = chunker.chunk(doc);
            if (drafts.isEmpty()) {
                continue;
            }
            String newHash = drafts.get(0).contentHash();
            boolean unchanged = newHash.equals(existingHashes.get(doc.knowledgeId()));
            (unchanged ? unchangedDrafts : changedDrafts).addAll(drafts);
        }

        String embeddingModel = properties.getMistral().getEmbedModel();

        for (ChunkDraft draft : unchangedDrafts) {
            indexRepository.upsertMetadataOnly(toChunk(draft, embeddingModel, null));
        }

        int embeddedCount = 0;
        if (!changedDrafts.isEmpty()) {
            List<String> texts = changedDrafts.stream().map(ChunkDraft::embeddableText).toList();
            List<float[]> vectors = embeddingProvider.embedBatch(texts, null); // no deadline — offline pipeline
            if (vectors.size() != changedDrafts.size()) {
                throw new IllegalStateException("Embedding provider returned " + vectors.size()
                        + " vectors for " + changedDrafts.size() + " inputs — refusing to index a misaligned batch.");
            }
            for (int i = 0; i < changedDrafts.size(); i++) {
                indexRepository.upsert(toChunk(changedDrafts.get(i), embeddingModel, vectors.get(i)));
            }
            embeddedCount = changedDrafts.size();
        }

        int removed = 0;
        for (String staleId : existingHashes.keySet()) {
            if (!currentKnowledgeIds.contains(staleId)) {
                removed += indexRepository.deleteByKnowledgeId(staleId);
            }
        }

        Instant finishedAt = Instant.now();
        IndexingReport report = new IndexingReport(
                documents.size(), unchangedDrafts.size() + changedDrafts.size(),
                embeddedCount, unchangedDrafts.size(), removed, startedAt, finishedAt);
        log.info("Reindex complete: {} documents, {} chunks ({} embedded, {} reused), {} stale removed, {}ms",
                report.documents(), report.chunks(), report.embedded(), report.reused(), report.removed(),
                finishedAt.toEpochMilli() - startedAt.toEpochMilli());
        return report;
    }

    private static KnowledgeChunk toChunk(ChunkDraft draft, String embeddingModel, float[] embedding) {
        return new KnowledgeChunk(
                draft.knowledgeId(), draft.chunkOrdinal(), draft.type(), draft.module(), draft.pageId(),
                draft.sourceRef(), draft.version(), draft.contentHash(), embeddingModel,
                draft.title(), draft.body(), draft.audience(), embedding);
    }
}
