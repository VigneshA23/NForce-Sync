package com.nforceone.sync.auth;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Project Managers (role PM) have a READ-ONLY view of Team Lead / employee conversations: they can
 * read blocker and EOD-clarification threads, but never post, edit, delete, resolve, change a status,
 * or open a clarification. One place for that rule, so the services that mutate those threads all
 * apply the same check instead of each hard-coding a role comparison.
 *
 * <p>Enforced server-side (a 403), not only by hiding the controls in the UI, so a direct API call
 * with a PM token is rejected too. Keyed on {@link AppUser.Role#PM}, the role that gets the PM pages;
 * a user of another role who is merely assigned as a project's PM is not covered by this rule.
 */
public final class PmReadOnlyPolicy {
    private PmReadOnlyPolicy() {}

    public static boolean isReadOnlyPm(AppUser actor) {
        return actor != null && actor.getRole() == AppUser.Role.PM;
    }

    /** @param what plural noun for the message, e.g. "blockers" or "clarifications". */
    public static void requireNotReadOnlyPm(AppUser actor, String what) {
        if (isReadOnlyPm(actor)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Project Managers have a read-only view of " + what + ". Replies and changes are handled by Team Leads.");
        }
    }
}
