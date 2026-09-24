package com.nforceone.sync.ai.response;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.contract.AssistantResponse;
import com.nforceone.sync.ai.contract.AssistantResponseType;
import com.nforceone.sync.ai.contract.ConfidenceLevel;
import com.nforceone.sync.ai.contract.NavigationAction;
import com.nforceone.sync.ai.contract.RelatedItem;
import com.nforceone.sync.ai.navigation.NavigationValidator;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Parses and validates raw Mistral output into the backend-owned {@link AssistantResponse}
 * contract. A malformed or unsafe output becomes a controlled {@code UNKNOWN} response — never a
 * 500, and never a best-effort invented answer.
 */
@Component
public class ResponseValidator {

    private static final int MAX_ANSWER_CHARS = 4000;
    private static final int MAX_STEPS = 20;
    private static final int MAX_STEP_CHARS = 500;
    private static final int MAX_RELATED = 6;

    // I19: a model answer that falsely claims to have performed a mutating action. Deliberately
    // broad ("i have|i've" near a mutation verb within a short span) rather than an exact phrase
    // list, since a model can phrase a false completion claim many ways.
    private static final Pattern CLAIMED_ACTION = Pattern.compile(
            "(?i)\\bi(?:'ve| have)\\b[^.!?]{0,40}\\b(approved|submitted|rejected|allocated|created|"
                    + "updated|deleted|removed|added|changed|saved|resolved|assigned)\\b");

    private final ObjectMapper objectMapper;
    private final NavigationValidator navigationValidator;

    public ResponseValidator(ObjectMapper objectMapper, NavigationValidator navigationValidator) {
        this.objectMapper = objectMapper;
        this.navigationValidator = navigationValidator;
    }

    public AssistantResponse validate(String rawModelOutput, AssistantRequestContext context) {
        JsonNode root = parse(rawModelOutput);
        if (root == null) {
            return UnknownResponses.malformedResponse();
        }

        String answer = trimToNull(root.path("answer").asString(null));
        if (answer == null) {
            return UnknownResponses.malformedResponse();
        }
        if (answer.length() > MAX_ANSWER_CHARS) {
            answer = answer.substring(0, MAX_ANSWER_CHARS);
        }
        if (CLAIMED_ACTION.matcher(answer).find()) {
            return UnknownResponses.claimedAction();
        }

        AssistantResponseType type = AssistantResponseType.fromCode(root.path("type").asString(null))
                .orElse(AssistantResponseType.EXPLANATION);

        NavigationAction navigation = null;
        JsonNode navNode = root.path("navigation");
        if (navNode.isObject()) {
            String pageId = trimToNull(navNode.path("pageId").asString(null));
            navigation = navigationValidator.validate(pageId, context).orElse(null);
        }
        if (type == AssistantResponseType.NAVIGATION && navigation == null) {
            // The proposed page didn't survive validation (unknown, placeholder, or not
            // reachable by this role) — downgrade rather than claim a navigation that isn't real.
            type = AssistantResponseType.EXPLANATION;
        }

        List<String> steps = type == AssistantResponseType.UNKNOWN
                ? List.of()
                : extractSteps(root.path("steps"));

        List<RelatedItem> related = extractRelated(root.path("related"));

        ConfidenceLevel confidence = type == AssistantResponseType.UNKNOWN
                ? ConfidenceLevel.LOW
                : ConfidenceLevel.fromCode(root.path("confidence").asString(null)).orElse(ConfidenceLevel.LOW);

        // conversationId/messageId are filled in by AiAssistantService, not the model.
        return new AssistantResponse(type, answer, steps, navigation, related, confidence, null, null);
    }

    private JsonNode parse(String rawModelOutput) {
        if (rawModelOutput == null || rawModelOutput.isBlank()) {
            return null;
        }
        String candidate = stripCodeFence(rawModelOutput.trim());
        int start = candidate.indexOf('{');
        int end = candidate.lastIndexOf('}');
        if (start < 0 || end < start) {
            return null;
        }
        candidate = candidate.substring(start, end + 1);
        try {
            JsonNode node = objectMapper.readTree(candidate);
            return node.isObject() ? node : null;
        } catch (JacksonException e) {
            return null;
        }
    }

    private static String stripCodeFence(String text) {
        if (text.startsWith("```")) {
            int firstNewline = text.indexOf('\n');
            String withoutOpenFence = firstNewline >= 0 ? text.substring(firstNewline + 1) : text;
            int closeFence = withoutOpenFence.lastIndexOf("```");
            return closeFence >= 0 ? withoutOpenFence.substring(0, closeFence) : withoutOpenFence;
        }
        return text;
    }

    private List<String> extractSteps(JsonNode stepsNode) {
        if (!stepsNode.isArray()) {
            return List.of();
        }
        List<String> steps = new ArrayList<>();
        for (JsonNode item : stepsNode) {
            if (steps.size() >= MAX_STEPS) {
                break;
            }
            String step = trimToNull(item.asString(null));
            if (step != null) {
                steps.add(step.length() > MAX_STEP_CHARS ? step.substring(0, MAX_STEP_CHARS) : step);
            }
        }
        return steps;
    }

    private List<RelatedItem> extractRelated(JsonNode relatedNode) {
        if (!relatedNode.isArray()) {
            return List.of();
        }
        List<RelatedItem> related = new ArrayList<>();
        for (JsonNode item : relatedNode) {
            if (related.size() >= MAX_RELATED) {
                break;
            }
            String label = trimToNull(item.path("label").asString(null));
            if (label == null) {
                continue; // an item without a label is useless to render — drop it
            }
            String type = trimToNull(item.path("type").asString(null));
            String refId = trimToNull(item.path("refId").asString(null));
            related.add(new RelatedItem(type, refId, label));
        }
        return related;
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String trimmed = s.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
