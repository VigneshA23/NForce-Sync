package com.nforceone.sync.ai.action;

import com.nforceone.sync.ai.contract.AssistantRequestContext;

/**
 * Where a future action's authorization would be decided — always server-side from
 * {@link AssistantRequestContext}, never from anything the model or the client supplies.
 * No implementation exists in v1.
 */
public interface ActionAuthorization {

    boolean isAuthorized(ActionDefinition definition, AssistantRequestContext context);
}
