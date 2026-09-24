package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.exception.KnowledgeValidationException;
import com.nforceone.sync.ai.navigation.PageRegistry;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * Loads every real authored knowledge YAML file and runs it through the real
 * {@link KnowledgeSchemaValidator} — the permanent regression test for content authored under
 * M4. Free (no API calls), runs in the normal suite, matches the "after editing knowledge" check
 * in the plan's knowledge-authoring docs.
 */
class AllKnowledgeValidatesTest {

    @Test
    void everyAuthoredKnowledgeUnitPassesSchemaValidation() {
        PageRegistry registry = new PageRegistry();
        registry.load();
        KnowledgeSchemaValidator validator = new KnowledgeSchemaValidator(registry);

        List<KnowledgeDocument> documents = new YamlKnowledgeSource().load();
        assertFalse(documents.isEmpty(), "expected at least some authored knowledge to exist");

        assertDoesNotThrow(() -> validator.validate(documents));
    }
}
