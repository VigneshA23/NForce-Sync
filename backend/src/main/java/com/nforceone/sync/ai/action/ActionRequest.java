package com.nforceone.sync.ai.action;

import java.util.Map;

/**
 * What a caller would send to execute an action, once one exists. No endpoint in
 * {@code AiAssistantController} accepts this type — see {@code package-info.java}, guarantee 5.
 */
public record ActionRequest(
        String actionId,
        Map<String, Object> parameters,
        String confirmationToken,
        String conversationId
) {
    public ActionRequest {
        parameters = parameters == null ? Map.of() : Map.copyOf(parameters);
    }
}
