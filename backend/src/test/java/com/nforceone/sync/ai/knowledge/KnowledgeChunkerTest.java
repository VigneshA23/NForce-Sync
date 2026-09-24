package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class KnowledgeChunkerTest {

    private final KnowledgeChunker chunker = new KnowledgeChunker();

    private static KnowledgeDocument.Builder doc() {
        return new KnowledgeDocument.Builder()
                .knowledgeId("test.chunk")
                .type(KnowledgeType.ACTION)
                .audience(Set.of(AppUser.Role.EMPLOYEE))
                .title("Submitting an EOD")
                .synonyms(List.of("daily update", "log my day"))
                .body("Open Submit EOD from the sidebar and fill in your tasks for the day.");
    }

    @Test
    void shortDocumentProducesExactlyOneChunk() {
        List<ChunkDraft> chunks = chunker.chunk(doc().build());
        assertEquals(1, chunks.size());
        assertEquals(0, chunks.get(0).chunkOrdinal());
    }

    @Test
    void embeddableTextIncludesTitleSynonymsAndBody() {
        ChunkDraft chunk = chunker.chunk(doc().build()).get(0);
        String text = chunk.embeddableText();
        assertTrue(text.contains("Submitting an EOD"));
        assertTrue(text.contains("daily update"));
        assertTrue(text.contains("log my day"));
        assertTrue(text.contains("Open Submit EOD from the sidebar"));
    }

    @Test
    void storedBodyIsCleanWithoutTitleOrSynonymsBakedIn() {
        // Fixes I7: the persisted/displayed body must not duplicate the title a second time in
        // the prompt on top of the separately-rendered title field.
        ChunkDraft chunk = chunker.chunk(doc().build()).get(0);
        assertEquals("Open Submit EOD from the sidebar and fill in your tasks for the day.", chunk.body());
        assertFalse(chunk.body().contains("Also asked as"));
    }

    @Test
    void contentHashIsDeterministicAndChangesWithContent() {
        String hash1 = chunker.chunk(doc().build()).get(0).contentHash();
        String hash2 = chunker.chunk(doc().build()).get(0).contentHash();
        assertEquals(hash1, hash2, "identical input must hash identically");

        String hash3 = chunker.chunk(doc().body("A different body entirely.").build()).get(0).contentHash();
        assertNotEquals(hash1, hash3, "changed body must change the hash");

        String hash4 = chunker.chunk(doc().synonyms(List.of("a new synonym")).build()).get(0).contentHash();
        assertNotEquals(hash1, hash4, "changed synonyms must change the hash (they affect what is embedded)");
    }

    @Test
    void longBodySplitsOnParagraphBoundariesWithSequentialOrdinalsAndSharedHash() {
        String paragraph = "x".repeat(1000);
        String longBody = String.join("\n\n", paragraph, paragraph, paragraph, paragraph, paragraph);
        assertTrue(longBody.length() > KnowledgeChunker.MAX_CHUNK_CHARS);

        List<ChunkDraft> chunks = chunker.chunk(doc().body(longBody).build());
        assertTrue(chunks.size() > 1, "a body over the max chunk size must split");

        for (int i = 0; i < chunks.size(); i++) {
            assertEquals(i, chunks.get(i).chunkOrdinal());
            assertTrue(chunks.get(i).body().length() <= KnowledgeChunker.MAX_CHUNK_CHARS + 2,
                    "each piece should respect the size backstop");
        }
        // Every piece of the same document shares one contentHash — findContentHashes()'s
        // DISTINCT ON relies on this.
        String firstHash = chunks.get(0).contentHash();
        assertTrue(chunks.stream().allMatch(c -> c.contentHash().equals(firstHash)));
    }
}
