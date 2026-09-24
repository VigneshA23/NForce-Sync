package com.nforceone.sync.ai.eval;

import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.KnowledgeDocument;
import com.nforceone.sync.ai.knowledge.YamlKnowledgeSource;
import com.nforceone.sync.ai.navigation.PageRegistry;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Static, free, no-API-calls validation of the evaluation fixture set — runs in the normal test
 * suite. It checks the fixtures themselves are well-formed and internally consistent with the
 * real registry and knowledge base; it does not call Mistral or assert what a model answers (see
 * {@code AiEvaluationHarness}, added once the live orchestration exists, for that).
 */
class AiEvaluationSetTest {

    private static List<EvalQuestion> questions;
    private static PageRegistry registry;
    private static Map<String, KnowledgeDocument> knowledgeById;

    @BeforeAll
    static void loadFixtures() {
        questions = EvaluationSet.load();

        registry = new PageRegistry();
        registry.load();

        knowledgeById = new HashMap<>();
        for (KnowledgeDocument doc : new YamlKnowledgeSource().load()) {
            knowledgeById.put(doc.knowledgeId(), doc);
        }
    }

    @Test
    void hasAMeaningfulNumberOfQuestions() {
        assertTrue(questions.size() >= 40, "expected at least 40 fixture questions, found " + questions.size());
    }

    @Test
    void idsAreUnique() {
        Set<String> seen = new HashSet<>();
        for (EvalQuestion q : questions) {
            assertNotNull(q.id(), "a question is missing an id: " + q.question());
            assertTrue(seen.add(q.id()), "duplicate fixture id: " + q.id());
        }
    }

    @Test
    void everyRoleIsAValidAppUserRole() {
        for (EvalQuestion q : questions) {
            assertDoesNotThrow(() -> AppUser.Role.valueOf(q.role()),
                    q.id() + ": role '" + q.role() + "' is not a valid AppUser.Role");
        }
    }

    @Test
    void everyExpectedTypeIsValid() {
        for (EvalQuestion q : questions) {
            for (String type : q.expect().type()) {
                assertDoesNotThrow(() -> AssistantResponseType.valueOf(type),
                        q.id() + ": expected type '" + type + "' is not a valid AssistantResponseType");
            }
        }
    }

    @Test
    void everyCategoryIsPresent() {
        for (EvalQuestion q : questions) {
            assertNotNull(q.category(), q.id() + ": category is required");
            assertFalse(q.category().isBlank(), q.id() + ": category must not be blank");
        }
    }

    @Test
    void everyExpectedNavigationIsRealReachableAndNonPlaceholderForThatRole() {
        for (EvalQuestion q : questions) {
            String pageId = q.expect().navigation();
            if (pageId == null || pageId.equals("none")) {
                continue;
            }
            AppUser.Role role = AppUser.Role.valueOf(q.role());
            var ref = registry.find(pageId, role);
            assertTrue(ref.isPresent(),
                    q.id() + ": expected navigation pageId '" + pageId + "' has no registry variant for role " + role);
            assertFalse(ref.get().placeholder(),
                    q.id() + ": expected navigation pageId '" + pageId + "' is a placeholder for role " + role
                            + " — a fixture must never expect navigation to a placeholder");
        }
    }

    @Test
    void everyExpectedKnowledgeIdExistsAndIsVisibleToThatRole() {
        for (EvalQuestion q : questions) {
            AppUser.Role role = AppUser.Role.valueOf(q.role());
            for (String knowledgeId : q.expect().knowledge()) {
                KnowledgeDocument doc = knowledgeById.get(knowledgeId);
                assertNotNull(doc, q.id() + ": expected knowledge id '" + knowledgeId + "' does not exist");
                assertTrue(doc.audience().contains(role),
                        q.id() + ": expected knowledge id '" + knowledgeId + "' is not visible to role " + role
                                + " (audience: " + doc.audience() + ")");
            }
        }
    }

    @Test
    void placeholderCategoryQuestionsNeverExpectNavigation() {
        for (EvalQuestion q : questions) {
            if ("placeholder".equals(q.category()) || "unauthorized".equals(q.category())
                    || "out-of-scope".equals(q.category()) || "unknown".equals(q.category())) {
                String nav = q.expect().navigation();
                assertTrue(nav == null || nav.equals("none"),
                        q.id() + ": a " + q.category() + " question must not expect a real navigation target");
            }
        }
    }

    @Test
    void everyRoleHasAtLeastOneFixture() {
        Set<String> rolesCovered = new HashSet<>();
        for (EvalQuestion q : questions) {
            rolesCovered.add(q.role());
        }
        for (AppUser.Role role : AppUser.Role.values()) {
            assertTrue(rolesCovered.contains(role.name()), "no fixture question covers role " + role);
        }
    }

    @Test
    void hasTheOutOfScopeCanary() {
        assertTrue(questions.stream().anyMatch(q -> q.id().equals("emp.scope.capital")),
                "the min-score canary question (emp.scope.capital) must always be present — "
                        + "if it ever starts producing an answer, the retrieval threshold has drifted");
    }
}
