package com.nforceone.sync.ai.index;

import com.nforceone.sync.ai.contract.KnowledgeChunk;
import com.nforceone.sync.ai.contract.KnowledgeIndexRepository;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.contract.RetrievalQuery;
import com.nforceone.sync.ai.contract.RetrievalResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The only code that touches {@code ai_knowledge_chunk} / {@code ai_knowledge_chunk_audience},
 * reached exclusively through {@link JdbcTemplate} with parameterised native SQL — deliberately
 * never a JPA entity. Two reasons:
 * <ol>
 *   <li>Sync's Hibernate runs with {@code ddl-auto: none} and validates against the real schema
 *       on every startup; a {@code vector(1024)} column has no JPA/Hibernate type in this
 *       project, and there is no test profile here to isolate that concern from production
 *       startup (see backend/CLAUDE.md — unlike OneHR, which runs its test suite against H2).</li>
 *   <li>The embedding value is never something application code should be able to select/update
 *       through the ORM's generic query machinery — it only ever needs to be written by the
 *       indexing pipeline and read by one similarity query, both of which are naturally raw SQL.</li>
 * </ol>
 *
 * <p>The audience predicate lives inside the kNN query itself (an {@code EXISTS} subquery), not
 * applied afterward in Java — filtering after the fact would mean unauthorised chunks were
 * fetched, ranked and only then dropped by a line of Java someone could later move or delete. An
 * empty audience set fails closed: {@link #search} returns {@code List.of()} without a query.
 */
@Repository
public class PgVectorKnowledgeIndexRepository implements KnowledgeIndexRepository {

    private static final String UPSERT_SQL = """
            INSERT INTO ai_knowledge_chunk
                (knowledge_id, chunk_ordinal, knowledge_type, module, page_id, source_ref, version,
                 content_hash, embedding_model, title, body, embedding, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::vector, now())
            ON CONFLICT (knowledge_id, chunk_ordinal) DO UPDATE SET
                knowledge_type = EXCLUDED.knowledge_type,
                module = EXCLUDED.module,
                page_id = EXCLUDED.page_id,
                source_ref = EXCLUDED.source_ref,
                version = EXCLUDED.version,
                content_hash = EXCLUDED.content_hash,
                embedding_model = EXCLUDED.embedding_model,
                title = EXCLUDED.title,
                body = EXCLUDED.body,
                embedding = EXCLUDED.embedding,
                indexed_at = now()
            RETURNING id
            """;

    private static final String UPDATE_METADATA_SQL = """
            UPDATE ai_knowledge_chunk
            SET knowledge_type = ?, module = ?, page_id = ?, source_ref = ?, version = ?, indexed_at = now()
            WHERE knowledge_id = ? AND chunk_ordinal = ?
            RETURNING id
            """;

    private final JdbcTemplate jdbcTemplate;

    public PgVectorKnowledgeIndexRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void upsert(KnowledgeChunk chunk) {
        Long chunkId = jdbcTemplate.queryForObject(UPSERT_SQL, Long.class,
                chunk.knowledgeId(), chunk.chunkOrdinal(), chunk.type().name(), chunk.module(), chunk.pageId(),
                chunk.sourceRef(), chunk.version(), chunk.contentHash(), chunk.embeddingModel(),
                chunk.title(), chunk.body(), toVectorLiteral(chunk.embedding()));

        jdbcTemplate.update("DELETE FROM ai_knowledge_chunk_audience WHERE chunk_id = ?", chunkId);
        Set<String> audience = chunk.audience();
        if (audience != null && !audience.isEmpty()) {
            List<Object[]> batchArgs = audience.stream()
                    .map(a -> new Object[]{chunkId, a})
                    .toList();
            jdbcTemplate.batchUpdate(
                    "INSERT INTO ai_knowledge_chunk_audience (chunk_id, audience) VALUES (?, ?)", batchArgs);
        }
    }

    @Override
    public void upsertMetadataOnly(KnowledgeChunk chunk) {
        List<Long> ids = jdbcTemplate.query(UPDATE_METADATA_SQL,
                (rs, rowNum) -> rs.getLong("id"),
                chunk.type().name(), chunk.module(), chunk.pageId(), chunk.sourceRef(), chunk.version(),
                chunk.knowledgeId(), chunk.chunkOrdinal());
        if (ids.isEmpty()) {
            return; // no matching row — callers only take this path once findContentHashes() has confirmed one exists
        }
        Long chunkId = ids.get(0);
        jdbcTemplate.update("DELETE FROM ai_knowledge_chunk_audience WHERE chunk_id = ?", chunkId);
        Set<String> audience = chunk.audience();
        if (audience != null && !audience.isEmpty()) {
            List<Object[]> batchArgs = audience.stream()
                    .map(a -> new Object[]{chunkId, a})
                    .toList();
            jdbcTemplate.batchUpdate(
                    "INSERT INTO ai_knowledge_chunk_audience (chunk_id, audience) VALUES (?, ?)", batchArgs);
        }
    }

    @Override
    public void upsertAll(List<KnowledgeChunk> chunks) {
        // Each upsert needs its own RETURNING id to replace that specific chunk's audience rows,
        // which JdbcTemplate.batchUpdate cannot return per-row — so this loops rather than
        // batching the INSERT itself. The caller (KnowledgeIndexingService) wraps the whole
        // reindex — deletes and every upsertAll call — in one transaction (improvement I1 over
        // OneHR, where a mid-rebuild failure could leave the index empty).
        for (KnowledgeChunk chunk : chunks) {
            upsert(chunk);
        }
    }

    @Override
    public int deleteByKnowledgeId(String knowledgeId) {
        return jdbcTemplate.update("DELETE FROM ai_knowledge_chunk WHERE knowledge_id = ?", knowledgeId);
    }

    @Override
    public int deleteBySourceRefPrefix(String sourceRefPrefix) {
        String escaped = sourceRefPrefix
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return jdbcTemplate.update(
                "DELETE FROM ai_knowledge_chunk WHERE source_ref LIKE ? ESCAPE '!'", escaped + "%");
    }

    @Override
    public long count() {
        Long result = jdbcTemplate.queryForObject("SELECT count(*) FROM ai_knowledge_chunk", Long.class);
        return result == null ? 0 : result;
    }

    @Override
    public Optional<Instant> lastIndexedAt() {
        OffsetDateTime max = jdbcTemplate.queryForObject(
                "SELECT max(indexed_at) FROM ai_knowledge_chunk", OffsetDateTime.class);
        return Optional.ofNullable(max).map(OffsetDateTime::toInstant);
    }

    @Override
    public Map<String, String> findContentHashes() {
        // DISTINCT ON handles a unit split into more than one chunk (chunk_ordinal > 0) without
        // over-counting — every chunk of the same document shares the same contentHash, computed
        // once from the whole document's text before chunking, so any one row is representative.
        return jdbcTemplate.query(
                "SELECT DISTINCT ON (knowledge_id) knowledge_id, content_hash FROM ai_knowledge_chunk "
                        + "ORDER BY knowledge_id, chunk_ordinal",
                this::extractContentHashes);
    }

    private Map<String, String> extractContentHashes(ResultSet rs) throws SQLException {
        Map<String, String> result = new LinkedHashMap<>();
        while (rs.next()) {
            result.put(rs.getString("knowledge_id"), rs.getString("content_hash"));
        }
        return result;
    }

    @Override
    public List<RetrievalResult> search(RetrievalQuery query) {
        Set<String> audience = query.audience();
        if (audience == null || audience.isEmpty()) {
            return List.of();
        }

        String placeholders = audience.stream().map(a -> "?").collect(Collectors.joining(","));
        String sql = """
                SELECT * FROM (
                    SELECT c.knowledge_id, c.chunk_ordinal, c.knowledge_type, c.module, c.page_id,
                           c.source_ref, c.title, c.body,
                           1 - (c.embedding <=> ?::vector) AS score
                    FROM ai_knowledge_chunk c
                    WHERE EXISTS (
                        SELECT 1 FROM ai_knowledge_chunk_audience a
                        WHERE a.chunk_id = c.id AND a.audience IN (%s)
                    )
                    ORDER BY c.embedding <=> ?::vector
                    LIMIT ?
                ) ranked
                WHERE ranked.score >= ?
                ORDER BY ranked.score DESC
                """.formatted(placeholders);

        String vectorLiteral = toVectorLiteral(query.embedding());
        List<Object> params = new ArrayList<>();
        params.add(vectorLiteral);
        params.addAll(audience);
        params.add(vectorLiteral);
        params.add(query.topK());
        params.add(query.minScore());

        return jdbcTemplate.query(sql, this::mapRow, params.toArray());
    }

    private RetrievalResult mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new RetrievalResult(
                rs.getString("knowledge_id"),
                rs.getInt("chunk_ordinal"),
                KnowledgeType.fromCode(rs.getString("knowledge_type")).orElse(null),
                rs.getString("module"),
                rs.getString("page_id"),
                rs.getString("source_ref"),
                rs.getString("title"),
                rs.getString("body"),
                rs.getDouble("score"));
    }

    private static String toVectorLiteral(float[] embedding) {
        StringBuilder sb = new StringBuilder(embedding.length * 9 + 2);
        sb.append('[');
        for (int i = 0; i < embedding.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(embedding[i]);
        }
        sb.append(']');
        return sb.toString();
    }
}
