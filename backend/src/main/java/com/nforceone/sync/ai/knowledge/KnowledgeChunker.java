package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * One chunk per authored unit, never a fixed token window — splitting on a raw character count
 * would cut an action's preconditions away from its steps, and retrieving half of that is worse
 * than retrieving none, because the model would answer confidently from an instruction set with
 * the caveats removed. A unit only splits past {@link #MAX_CHUNK_CHARS}, on paragraph boundaries,
 * as a backstop — {@code KnowledgeSchemaValidator} already rejects a body over that size, so in
 * practice this is defensive: it exists for the day someone raises that limit without also
 * checking here.
 */
@Component
public class KnowledgeChunker {

    static final int MAX_CHUNK_CHARS = 4000;

    List<ChunkDraft> chunk(KnowledgeDocument doc) {
        String contentHash = sha256(embeddableText(doc, doc.body()));
        Set<String> audience = doc.audience().stream()
                .map(Enum::name)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<String> pieces = splitBody(doc.body());
        List<ChunkDraft> chunks = new ArrayList<>(pieces.size());
        for (int ordinal = 0; ordinal < pieces.size(); ordinal++) {
            String piece = pieces.get(ordinal);
            chunks.add(new ChunkDraft(
                    doc.knowledgeId(), ordinal, doc.type(), doc.module(), doc.pageId(), doc.sourceRef(),
                    doc.version(), contentHash, doc.title(), piece, audience, embeddableText(doc, piece)));
        }
        return chunks;
    }

    /** What actually gets embedded: title + "Also asked as: synonyms" (if any) + this piece's body. */
    private static String embeddableText(KnowledgeDocument doc, String bodyPiece) {
        StringBuilder sb = new StringBuilder();
        sb.append(doc.title());
        if (!doc.synonyms().isEmpty()) {
            sb.append("\nAlso asked as: ").append(String.join("; ", doc.synonyms()));
        }
        sb.append("\n\n").append(bodyPiece);
        return sb.toString();
    }

    private static List<String> splitBody(String body) {
        if (body == null) {
            return List.of("");
        }
        if (body.length() <= MAX_CHUNK_CHARS) {
            return List.of(body);
        }
        List<String> pieces = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String paragraph : body.split("\\n\\n")) {
            if (current.length() > 0 && current.length() + paragraph.length() + 2 > MAX_CHUNK_CHARS) {
                pieces.add(current.toString());
                current = new StringBuilder();
            }
            if (current.length() > 0) {
                current.append("\n\n");
            }
            current.append(paragraph);
        }
        if (current.length() > 0) {
            pieces.add(current.toString());
        }
        return pieces.isEmpty() ? List.of(body) : pieces;
    }

    private static String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
