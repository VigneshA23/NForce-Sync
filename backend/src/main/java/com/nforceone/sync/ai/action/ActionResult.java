package com.nforceone.sync.ai.action;

import java.util.Map;

/** What executing an action would return, once one exists. */
public record ActionResult(
        String actionId,
        ActionOutcome outcome,
        String message,
        Map<String, Object> details
) {
    public ActionResult {
        details = details == null ? Map.of() : Map.copyOf(details);
    }

    public static ActionResult disabled(String actionId) {
        return new ActionResult(actionId, ActionOutcome.DISABLED,
                "The assistant cannot perform actions.", Map.of());
    }
}
