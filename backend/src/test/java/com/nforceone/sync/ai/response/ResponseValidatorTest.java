package com.nforceone.sync.ai.response;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.ConfidenceLevel;
import com.nforceone.sync.ai.navigation.NavigationValidator;
import com.nforceone.sync.ai.navigation.PageRegistry;
import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class ResponseValidatorTest {

    private ResponseValidator validator;

    @BeforeEach
    void setUp() {
        PageRegistry registry = new PageRegistry();
        registry.load();
        NavigationValidator navigationValidator = new NavigationValidator(registry);
        validator = new ResponseValidator(JsonMapper.builder().build(), navigationValidator);
    }

    private static AssistantRequestContext context(AppUser.Role role) {
        return new AssistantRequestContext(1L, "employee@nforceone.com", role, role.name(), null, null);
    }

    @Test
    void parsesAWellFormedResponse() {
        String json = """
                {"type":"HOW_TO","answer":"Open Submit EOD and fill in your tasks.",
                 "steps":["Open Submit EOD","Pick a day type","Add tasks","Submit"],
                 "confidence":"HIGH"}
                """;
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));

        assertEquals(AssistantResponseType.HOW_TO, response.type());
        assertEquals("Open Submit EOD and fill in your tasks.", response.answer());
        assertEquals(4, response.steps().size());
        assertEquals(ConfidenceLevel.HIGH, response.confidence());
        assertNull(response.navigation());
    }

    @Test
    void stripsMarkdownCodeFences() {
        String json = "```json\n{\"type\":\"EXPLANATION\",\"answer\":\"Sync tracks EODs.\"}\n```";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals("Sync tracks EODs.", response.answer());
    }

    @Test
    void blankOrMissingAnswerIsMalformed() {
        AssistantResponse response = validator.validate("{\"type\":\"EXPLANATION\",\"answer\":\"\"}", context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
    }

    @Test
    void unparseableJsonBecomesControlledUnknown() {
        AssistantResponse response = validator.validate("not json at all", context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        assertEquals(ConfidenceLevel.LOW, response.confidence());
    }

    @Test
    void missingTypeDefaultsToExplanation() {
        AssistantResponse response = validator.validate("{\"answer\":\"Some explanation.\"}", context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.EXPLANATION, response.type());
    }

    @Test
    void unknownEnumValueForTypeDefaultsToExplanation() {
        AssistantResponse response = validator.validate(
                "{\"type\":\"SOMETHING_MADE_UP\",\"answer\":\"text\"}", context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.EXPLANATION, response.type());
    }

    @Test
    void validNavigationForCallersRoleIsAccepted() {
        String json = "{\"type\":\"NAVIGATION\",\"answer\":\"Go to Submit EOD.\","
                + "\"navigation\":{\"pageId\":\"eod-submit\"}}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.NAVIGATION, response.type());
        assertNotNull(response.navigation());
        assertEquals("eod-submit", response.navigation().pageId());
        assertEquals("Submit EOD", response.navigation().label()); // label always comes from the registry, never the model
    }

    @Test
    void navigationToPlaceholderIsDroppedAndTypeDowngraded() {
        // "dashboard" is a placeholder for DM.
        String json = "{\"type\":\"NAVIGATION\",\"answer\":\"Go to your dashboard.\","
                + "\"navigation\":{\"pageId\":\"dashboard\"}}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.DM));
        assertNull(response.navigation());
        assertEquals(AssistantResponseType.EXPLANATION, response.type());
    }

    @Test
    void navigationToUnreachablePageForRoleIsDropped() {
        // "user-management" has no EMPLOYEE variant.
        String json = "{\"type\":\"NAVIGATION\",\"answer\":\"Go create a user.\","
                + "\"navigation\":{\"pageId\":\"user-management\"}}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertNull(response.navigation());
        assertEquals(AssistantResponseType.EXPLANATION, response.type());
    }

    @Test
    void navigationToInventedPageIdIsDropped() {
        String json = "{\"type\":\"NAVIGATION\",\"answer\":\"Go there.\","
                + "\"navigation\":{\"pageId\":\"this-page-does-not-exist\"}}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertNull(response.navigation());
    }

    @Test
    void modelSuppliedNavigationLabelIsIgnored() {
        String json = "{\"type\":\"NAVIGATION\",\"answer\":\"Go.\","
                + "\"navigation\":{\"pageId\":\"eod-submit\",\"label\":\"Made-up label\"}}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals("Submit EOD", response.navigation().label());
    }

    @Test
    void stepsAreCappedAt20AndEachStepAt500Chars() {
        StringBuilder stepsArray = new StringBuilder("[");
        for (int i = 0; i < 30; i++) {
            if (i > 0) stepsArray.append(',');
            stepsArray.append('"').append("x".repeat(600)).append('"');
        }
        stepsArray.append(']');
        String json = "{\"type\":\"HOW_TO\",\"answer\":\"ans\",\"steps\":" + stepsArray + "}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(20, response.steps().size());
        assertTrue(response.steps().get(0).length() <= 500);
    }

    @Test
    void unknownTypeAlwaysDropsStepsAndForcesLowConfidence() {
        String json = "{\"type\":\"UNKNOWN\",\"answer\":\"I don't know.\",\"steps\":[\"a\",\"b\"],\"confidence\":\"HIGH\"}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        assertTrue(response.steps().isEmpty());
        assertEquals(ConfidenceLevel.LOW, response.confidence());
    }

    @Test
    void relatedItemsWithoutALabelAreDropped() {
        String json = "{\"type\":\"EXPLANATION\",\"answer\":\"ans\",\"related\":"
                + "[{\"type\":\"PAGE\",\"refId\":\"x\"},{\"type\":\"PAGE\",\"refId\":\"y\",\"label\":\"Kept\"}]}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(1, response.related().size());
        assertEquals("Kept", response.related().get(0).label());
    }

    @Test
    void relatedItemsAreCappedAt6() {
        StringBuilder items = new StringBuilder("[");
        for (int i = 0; i < 10; i++) {
            if (i > 0) items.append(',');
            items.append("{\"label\":\"item").append(i).append("\"}");
        }
        items.append(']');
        String json = "{\"type\":\"EXPLANATION\",\"answer\":\"ans\",\"related\":" + items + "}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(6, response.related().size());
    }

    @Test
    void claimedCompletedActionIsReplacedWithReadOnlyDecline() {
        // I19: a model answer falsely claiming a mutation was performed must never reach the user.
        String json = "{\"type\":\"HOW_TO\",\"answer\":\"I have approved your EOD entry for you.\"}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.MANAGER));
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
        assertFalse(response.answer().toLowerCase().contains("i have approved"));
    }

    @Test
    void claimedActionGuardCatchesContractedForm() {
        String json = "{\"type\":\"HOW_TO\",\"answer\":\"I've submitted the entry on your behalf.\"}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(AssistantResponseType.UNKNOWN, response.type());
    }

    @Test
    void explainingHowToApproveIsNotFlaggedAsAClaimedAction() {
        // Must not false-positive on legitimate how-to text that merely mentions the verb.
        String json = "{\"type\":\"HOW_TO\",\"answer\":\"To approve an entry, open Approvals and click Approve.\"}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.MANAGER));
        assertEquals(AssistantResponseType.HOW_TO, response.type());
    }

    @Test
    void answerOverMaxLengthIsTruncated() {
        String longAnswer = "a".repeat(5000);
        String json = "{\"type\":\"EXPLANATION\",\"answer\":\"" + longAnswer + "\"}";
        AssistantResponse response = validator.validate(json, context(AppUser.Role.EMPLOYEE));
        assertEquals(4000, response.answer().length());
    }
}
