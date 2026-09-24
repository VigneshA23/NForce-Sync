package com.nforceone.sync.ai.action;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.exception.ActionExecutionDisabledException;

/**
 * Where a future action would actually run, by delegating to an existing Sync domain service —
 * never by reflection, SpEL, or dynamic dispatch. The only implementation in this codebase is
 * {@link DisabledActionExecutor}, which throws unconditionally.
 */
public interface ActionExecutor {

    ActionResult execute(ActionRequest request, AssistantRequestContext context) throws ActionExecutionDisabledException;
}
