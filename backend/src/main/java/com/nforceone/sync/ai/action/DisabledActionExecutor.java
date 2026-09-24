package com.nforceone.sync.ai.action;

import com.nforceone.sync.ai.contract.AssistantRequestContext;
import com.nforceone.sync.ai.exception.ActionExecutionDisabledException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The only {@link ActionExecutor} in this codebase. Throws unconditionally for every input —
 * there is no enable flag, because a property toggle would itself be an accidental-enable path.
 * It ignores {@link ActionDefinition#enabled()} entirely: even a definition that claims to be
 * enabled cannot execute.
 */
@Component
public final class DisabledActionExecutor implements ActionExecutor {

    private static final Logger log = LoggerFactory.getLogger(DisabledActionExecutor.class);

    @Override
    public ActionResult execute(ActionRequest request, AssistantRequestContext context) {
        String actionId = request == null ? "<null>" : request.actionId();
        log.warn("Action execution attempted for actionId={} by userId={} — the action framework "
                        + "is structurally disabled in this release; nothing was executed.",
                actionId, context == null ? "<null>" : context.userId());
        throw new ActionExecutionDisabledException("The assistant cannot perform actions.");
    }
}
