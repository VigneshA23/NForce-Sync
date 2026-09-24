package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Fails the build if authored knowledge cites a {@code sources:} file that does not exist in this
 * checkout — the traceability guarantee behind "knowledge is generated from the actual code, not
 * from CLAUDE.md or the prototype HTML files" (see the implementation plan's §2a, C22). Runs only
 * at build time against the real repository tree; {@code KnowledgeSchemaValidator} itself stays
 * filesystem-free because it also runs during a live production reindex, where this source tree
 * does not exist.
 *
 * <p>Currently a no-op check on an empty set (no {@code ACTION}/{@code PAGE}/{@code WORKFLOW}/
 * {@code ERROR} units exist yet — that is M4's job) and will start exercising real assertions as
 * soon as M4 adds units with a {@code sources:} list. The verbatim {@code errorMessages:} check
 * (also I21) is added alongside the first {@code ERROR}-type units in M4, once there are real
 * message literals to shape that check against.
 */
class KnowledgeSourceTraceabilityTest {

    private static final Path REPO_ROOT = Path.of("..");

    @Test
    void everySourcesEntryPointsToARealFile() {
        YamlKnowledgeSource source = new YamlKnowledgeSource();
        List<KnowledgeDocument> documents = source.load();

        for (KnowledgeDocument doc : documents) {
            for (String sourcePath : doc.sources()) {
                Path resolved = REPO_ROOT.resolve(sourcePath);
                assertTrue(Files.exists(resolved),
                        doc.knowledgeId() + " (" + doc.sourceRef() + ") cites a source that does not exist: "
                                + sourcePath + " (resolved: " + resolved.toAbsolutePath() + ")");
            }
        }
    }
}
