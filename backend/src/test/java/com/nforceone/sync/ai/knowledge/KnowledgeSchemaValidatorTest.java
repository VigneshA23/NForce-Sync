package com.nforceone.sync.ai.knowledge;

import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.contract.KnowledgeType;
import com.nforceone.sync.ai.exception.KnowledgeValidationException;
import com.nforceone.sync.ai.navigation.PageRegistry;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class KnowledgeSchemaValidatorTest {

    private KnowledgeSchemaValidator validator;

    @BeforeEach
    void setUp() {
        PageRegistry registry = new PageRegistry();
        registry.load();
        validator = new KnowledgeSchemaValidator(registry);
    }

    private static KnowledgeDocument.Builder valid() {
        return new KnowledgeDocument.Builder()
                .knowledgeId("test.valid")
                .type(KnowledgeType.TERM)
                .audience(Set.of(AppUser.Role.EMPLOYEE))
                .title("A valid unit")
                .body("This body is deliberately padded well past the forty character minimum required.");
    }

    @Test
    void acceptsAWellFormedDocument() {
        assertDoesNotThrow(() -> validator.validate(List.of(valid().build())));
    }

    @Test
    void rejectsEmptyAudience() {
        var ex = assertThrows(KnowledgeValidationException.class,
                () -> validator.validate(List.of(valid().audience(Set.of()).build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("audience must not be empty")));
    }

    @Test
    void rejectsBodyUnderMinimum() {
        var ex = assertThrows(KnowledgeValidationException.class,
                () -> validator.validate(List.of(valid().body("too short").build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("(minimum 40)")));
    }

    @Test
    void rejectsBodyOverMaximum() {
        String longBody = "x".repeat(4001);
        var ex = assertThrows(KnowledgeValidationException.class,
                () -> validator.validate(List.of(valid().body(longBody).build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("(maximum 4000)")));
    }

    @Test
    void rejectsDuplicateKnowledgeIds() {
        var ex = assertThrows(KnowledgeValidationException.class, () -> validator.validate(
                List.of(valid().build(), valid().build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("duplicate knowledgeId")));
    }

    @Test
    void rejectsUnknownPageId() {
        var ex = assertThrows(KnowledgeValidationException.class,
                () -> validator.validate(List.of(valid().pageId("no-such-page").build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("does not exist in the page registry")));
    }

    @Test
    void rejectsAudienceRoleWithNoVariantForThatPage() {
        // "user-management" (pageId) only has a variant for ADMIN, not EMPLOYEE.
        var ex = assertThrows(KnowledgeValidationException.class, () -> validator.validate(List.of(
                valid().pageId("user-management").audience(Set.of(AppUser.Role.EMPLOYEE)).build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("has no variant for that role")));
    }

    @Test
    void rejectsPlaceholderPageDescribedAsAvailable() {
        // "dashboard" for DM is a placeholder in registry.yaml.
        var ex = assertThrows(KnowledgeValidationException.class, () -> validator.validate(List.of(
                valid().pageId("dashboard").audience(Set.of(AppUser.Role.DM)).build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("is a placeholder for role")));
    }

    @Test
    void requiresSourcesForActionType() {
        var ex = assertThrows(KnowledgeValidationException.class, () -> validator.validate(List.of(
                valid().type(KnowledgeType.ACTION).build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("requires at least one entry in 'sources'")));
    }

    @Test
    void requiresErrorMessagesForErrorType() {
        var ex = assertThrows(KnowledgeValidationException.class, () -> validator.validate(List.of(
                valid().type(KnowledgeType.ERROR).sources(List.of("some/File.java")).build())));
        assertTrue(ex.getProblems().stream().anyMatch(p -> p.contains("requires at least one entry in 'errorMessages'")));
    }

    @Test
    void collectsMultipleProblemsInOnePass() {
        var ex = assertThrows(KnowledgeValidationException.class, () -> validator.validate(List.of(
                valid().audience(Set.of()).body("short").build())));
        assertTrue(ex.getProblems().size() >= 2, "expected both the audience and body problems in one report");
    }
}
