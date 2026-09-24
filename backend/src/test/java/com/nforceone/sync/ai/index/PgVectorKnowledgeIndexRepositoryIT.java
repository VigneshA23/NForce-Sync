package com.nforceone.sync.ai.index;

import com.nforceone.sync.ai.contract.KnowledgeChunk;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.contract.RetrievalQuery;
import com.nforceone.sync.ai.contract.RetrievalResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Opt-in integration test against the real shared Neon database (there is no local/test profile
 * in this project — see backend/CLAUDE.md), exercising real pgvector SQL: round-trip upsert,
 * audience fail-closed filtering, cosine-distance ordering, prefix deletion and content-hash
 * lookup. Skipped by default so a normal {@code mvn test} run never writes to the shared DB from
 * here; opt in with {@code AI_IT_ENABLED=true}.
 *
 * <p>Every row this test writes carries a {@code sourceRef} under a per-run unique prefix and is
 * removed in {@link #cleanUp()} regardless of assertion outcome, via
 * {@link PgVectorKnowledgeIndexRepository#deleteBySourceRefPrefix}.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "AI_IT_ENABLED", matches = "true")
class PgVectorKnowledgeIndexRepositoryIT {

    @Autowired
    private PgVectorKnowledgeIndexRepository repository;

    private String sourceRefPrefix;
    private String closeId;
    private String farId;

    @BeforeEach
    void setUp() {
        String runId = UUID.randomUUID().toString().substring(0, 8);
        sourceRefPrefix = "test-it:" + runId + "/";
        closeId = "test.it." + runId + ".close";
        farId = "test.it." + runId + ".far";
    }

    @AfterEach
    void cleanUp() {
        repository.deleteBySourceRefPrefix(sourceRefPrefix);
    }

    @Test
    void roundTripsUpsertSearchAndDelete() {
        float[] queryVector = oneHot(0);
        KnowledgeChunk close = chunk(closeId, "Close chunk v1", oneHot(0), Set.of("EMPLOYEE"));
        KnowledgeChunk far = chunk(farId, "Far chunk", oneHot(500), Set.of("EMPLOYEE"));
        repository.upsertAll(List.of(close, far));

        // Ordering: an exact match must outrank an orthogonal vector. minScore is permissive so
        // both come back and only their relative order is asserted.
        List<RetrievalResult> results = repository.search(new RetrievalQuery(
                "test query", queryVector, Set.of("EMPLOYEE"), null, null, 10, -1.0));
        List<String> ids = results.stream().map(RetrievalResult::knowledgeId).toList();
        assertTrue(ids.indexOf(closeId) < ids.indexOf(farId),
                "the close chunk must rank above the far chunk: " + ids);
        assertTrue(results.get(0).score() > 0.99, "an exact-direction match should score near 1.0");

        // Audience fail-closed: a role neither chunk was tagged with finds nothing.
        List<RetrievalResult> wrongAudience = repository.search(new RetrievalQuery(
                "test query", queryVector, Set.of("ADMIN"), null, null, 10, -1.0));
        assertTrue(wrongAudience.stream().noneMatch(r -> r.knowledgeId().equals(closeId) || r.knowledgeId().equals(farId)));

        // Empty caller audience must fail closed without matching anything, ever.
        assertEquals(List.of(), repository.search(new RetrievalQuery(
                "test query", queryVector, Set.of(), null, null, 10, -1.0)));

        // Upsert on the same (knowledgeId, chunkOrdinal) replaces, does not duplicate.
        repository.upsert(chunk(closeId, "Close chunk v2", oneHot(0), Set.of("EMPLOYEE")));
        List<RetrievalResult> afterUpdate = repository.search(new RetrievalQuery(
                "test query", queryVector, Set.of("EMPLOYEE"), null, null, 10, -1.0));
        long closeCount = afterUpdate.stream().filter(r -> r.knowledgeId().equals(closeId)).count();
        assertEquals(1, closeCount, "re-upserting the same chunk must not duplicate it");
        assertEquals("Close chunk v2", afterUpdate.stream()
                .filter(r -> r.knowledgeId().equals(closeId)).findFirst().orElseThrow().title());

        Map<String, String> hashes = repository.findContentHashes();
        assertTrue(hashes.containsKey(closeId));
        assertTrue(hashes.containsKey(farId));

        assertTrue(repository.count() >= 2);
        assertTrue(repository.lastIndexedAt().isPresent());
        Instant lastIndexed = repository.lastIndexedAt().get();
        assertTrue(lastIndexed.isAfter(Instant.now().minusSeconds(60)));

        int removed = repository.deleteBySourceRefPrefix(sourceRefPrefix);
        assertEquals(2, removed);
        assertEquals(List.of(), repository.search(new RetrievalQuery(
                "test query", queryVector, Set.of("EMPLOYEE"), null, null, 10, -1.0)));
    }

    private KnowledgeChunk chunk(String knowledgeId, String title, float[] embedding, Set<String> audience) {
        return new KnowledgeChunk(
                knowledgeId, 0, KnowledgeType.FAQ, "test-module", null,
                sourceRefPrefix + knowledgeId, 1, "hash-" + knowledgeId, "mistral-embed",
                title, "Body text for " + knowledgeId, audience, embedding);
    }

    private static float[] oneHot(int index) {
        float[] v = new float[1024];
        v[index] = 1.0f;
        return v;
    }
}
