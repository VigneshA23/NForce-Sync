package com.nforceone.sync.ai.action;

import com.nforceone.sync.auth.AppUser;

import java.util.List;

/**
 * Pure metadata for a future, explicit, registered action. Deliberately has <b>no execute
 * method</b> — holding an {@code ActionDefinition} gives a caller no way to run anything.
 * See {@code package-info.java} for the full set of guarantees that keep this framework inert.
 */
public interface ActionDefinition {

    String actionId();

    String name();

    String description();

    List<AppUser.Role> requiredRoles();

    List<ActionParameter> parameters();

    List<String> preconditions();

    boolean requiresConfirmation();

    String expectedResult();

    String module();

    String pageId();

    String workflowId();

    /** Ignored by {@link DisabledActionExecutor} — there is no code path where {@code true} matters. */
    boolean enabled();
}
