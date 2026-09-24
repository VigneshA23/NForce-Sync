package com.nforceone.sync.ai.action;

import java.time.Instant;
import java.util.Map;

/** A future "confirm before executing" step. Nothing in v1 issues or accepts one. */
public record ActionConfirmation(
        String token,
        String actionId,
        String summary,
        Map<String, Object> parameters,
        Instant expiresAt
) {
    public ActionConfirmation {
        parameters = parameters == null ? Map.of() : Map.copyOf(parameters);
    }
}
