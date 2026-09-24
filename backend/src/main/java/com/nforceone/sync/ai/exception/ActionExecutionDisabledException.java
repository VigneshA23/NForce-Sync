package com.nforceone.sync.ai.exception;

/**
 * Thrown unconditionally by {@code DisabledActionExecutor}. Nothing in the AI module ever catches
 * this and retries as a mutation — it exists purely so the (structurally unreachable) executor has
 * a well-typed failure mode to throw, per {@code action/package-info.java}'s guarantees.
 */
public class ActionExecutionDisabledException extends RuntimeException {

    public ActionExecutionDisabledException(String message) {
        super(message);
    }
}
