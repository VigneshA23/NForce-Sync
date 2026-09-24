package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.config.AiProperties;
import com.nforceone.sync.ai.contract.EmbeddingProvider;
import com.nforceone.sync.ai.contract.KnowledgeChunk;
import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.contract.KnowledgeIndexRepository;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.dto.IndexingReport;
import com.nforceone.sync.ai.navigation.PageRegistry;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class KnowledgeIndexingServiceTest {

    private static final float[] VECTOR_1024 = new float[1024];

    private KnowledgeIndexRepository indexRepository;
    private EmbeddingProvider embeddingProvider;
    private KnowledgeSchemaValidator schemaValidator;
    private AiProperties properties;

    @BeforeEach
    void setUp() {
        indexRepository = mock(KnowledgeIndexRepository.class);
        embeddingProvider = mock(EmbeddingProvider.class);
        when(embeddingProvider.dimensions()).thenReturn(1024);
        when(embeddingProvider.name()).thenReturn("mistral");

        PageRegistry registry = new PageRegistry();
        registry.load();
        schemaValidator = new KnowledgeSchemaValidator(registry);

        properties = new AiProperties();
        properties.getMistral().setEmbedModel("mistral-embed");
    }

    private KnowledgeIndexingService serviceWithFixedDocuments(List<KnowledgeDocument> documents) {
        KnowledgeSource fixedSource = new KnowledgeSource() {
            @Override public String name() { return "fixed"; }
            @Override public List<KnowledgeDocument> load() { return documents; }
        };
        return new KnowledgeIndexingService(List.of(fixedSource), schemaValidator, new KnowledgeChunker(),
                embeddingProvider, indexRepository, properties);
    }

    private static KnowledgeDocument doc(String id, String body) {
        return new KnowledgeDocument.Builder()
                .knowledgeId(id)
                .type(KnowledgeType.TERM)
                .audience(Set.of(AppUser.Role.EMPLOYEE))
                .title("Title for " + id)
                .body(body)
                .build();
    }

    @Test
    void refusesToIndexWhenEmbeddingDimensionsDoNotMatchTheSchema() {
        when(embeddingProvider.dimensions()).thenReturn(768);
        KnowledgeIndexingService service = serviceWithFixedDocuments(
                List.of(doc("a", "This body is padded well past the forty character minimum.")));

        assertThrows(IllegalStateException.class, service::reindex);
        verifyNoInteractions(indexRepository); // nothing written when the width is wrong
    }

    @Test
    void emptyDocumentSetLeavesTheExistingIndexUntouched() {
        KnowledgeIndexingService service = serviceWithFixedDocuments(List.of());

        IndexingReport report = service.reindex();

        assertEquals(0, report.documents());
        assertEquals(0, report.chunks());
        verify(indexRepository, never()).upsert(any());
        verify(indexRepository, never()).upsertMetadataOnly(any());
        verify(indexRepository, never()).deleteByKnowledgeId(any());
    }

    @Test
    void newContentIsEmbeddedAndFullyUpserted() {
        when(indexRepository.findContentHashes()).thenReturn(Map.of());
        when(embeddingProvider.embedBatch(anyList(), isNull())).thenReturn(List.of(VECTOR_1024));

        KnowledgeIndexingService service = serviceWithFixedDocuments(
                List.of(doc("test.new", "This body is padded well past the forty character minimum.")));
        IndexingReport report = service.reindex();

        assertEquals(1, report.embedded());
        assertEquals(0, report.reused());
        ArgumentCaptor<KnowledgeChunk> captor = ArgumentCaptor.forClass(KnowledgeChunk.class);
        verify(indexRepository).upsert(captor.capture());
        assertEquals("test.new", captor.getValue().knowledgeId());
        assertSame(VECTOR_1024, captor.getValue().embedding());
        verify(indexRepository, never()).upsertMetadataOnly(any());
    }

    @Test
    void unchangedContentSkipsEmbeddingAndUsesMetadataOnlyUpdate() {
        String body = "This body is padded well past the forty character minimum required by the validator.";
        KnowledgeDocument document = doc("test.unchanged", body);
        // Compute the real hash the same way the chunker would, so the mock's "existing" hash matches.
        String realHash = new KnowledgeChunker().chunk(document).get(0).contentHash();
        when(indexRepository.findContentHashes()).thenReturn(Map.of("test.unchanged", realHash));

        KnowledgeIndexingService service = serviceWithFixedDocuments(List.of(document));
        IndexingReport report = service.reindex();

        assertEquals(0, report.embedded());
        assertEquals(1, report.reused());
        verify(indexRepository).upsertMetadataOnly(argThat(c -> c.knowledgeId().equals("test.unchanged")));
        verify(indexRepository, never()).upsert(any());
        verify(embeddingProvider, never()).embedBatch(anyList(), any());
    }

    @Test
    void removesKnowledgeIdsNoLongerProducedByAnySource() {
        when(indexRepository.findContentHashes()).thenReturn(Map.of(
                "test.stale", "old-hash-no-longer-produced",
                "test.kept", "will-be-recomputed-and-differ-since-we-do-not-pre-seed-it"));
        when(indexRepository.deleteByKnowledgeId("test.stale")).thenReturn(1);
        when(embeddingProvider.embedBatch(anyList(), isNull())).thenReturn(List.of(VECTOR_1024));

        KnowledgeIndexingService service = serviceWithFixedDocuments(List.of(
                doc("test.kept", "This body is padded well past the forty character minimum.")));
        IndexingReport report = service.reindex();

        assertEquals(1, report.removed());
        verify(indexRepository).deleteByKnowledgeId("test.stale");
        verify(indexRepository, never()).deleteByKnowledgeId("test.kept");
    }

    @Test
    void rejectsInvalidDocumentsBeforeWritingAnything() {
        KnowledgeIndexingService service = serviceWithFixedDocuments(List.of(doc("test.bad", "too short")));

        assertThrows(com.nforceone.sync.ai.exception.KnowledgeValidationException.class, service::reindex);
        // The embedding-dimension check runs before validation (it's cheap and document-independent),
        // so embeddingProvider.dimensions() is called — but the expensive embedBatch call, and
        // anything on indexRepository, must never happen once validation has thrown.
        verify(embeddingProvider, never()).embedBatch(any(), any());
        verifyNoInteractions(indexRepository);
    }

    @Test
    void rejectsConcurrentReindex() throws InterruptedException {
        when(indexRepository.findContentHashes()).thenReturn(Map.of());
        when(embeddingProvider.embedBatch(anyList(), isNull())).thenAnswer(invocation -> {
            Thread.sleep(300);
            return List.of(VECTOR_1024);
        });

        KnowledgeIndexingService service = serviceWithFixedDocuments(
                List.of(doc("test.slow", "This body is padded well past the forty character minimum.")));

        Thread first = new Thread(service::reindex);
        first.start();
        Thread.sleep(50); // let the first call acquire the single-flight guard

        assertThrows(IllegalStateException.class, service::reindex,
                "a second reindex while one is in flight must be rejected");

        first.join(5000);
    }
}
