package com.nforceone.sync.auth;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A Project Manager has a READ-ONLY view of Team Lead / employee conversations: he can read blocker and
 * EOD-clarification threads on his projects, but never post, edit, delete, resolve, change a status, or
 * open a clarification there. One place for the rule's wording, so every service that mutates those
 * threads rejects a PM the same way.
 *
 * <p>Keyed on CAPACITY, not role: "PM" is a per-project assignment ({@code project.pm_id}), and the same
 * user may also be the Team Lead of other projects or a reporting manager. He is read-only on a task or
 * entry reached only through his PM projects, and keeps full lead / RM actions where he holds that
 * capacity. Callers decide whether the actor holds a reviewing capacity on the record; this class turns
 * the "no" answer into the right 403.
 *
 * <p>Enforced server-side (a 403), not only by hiding the controls in the UI.
 */
public final class PmReadOnlyPolicy {
    private PmReadOnlyPolicy() {}

    /**
     * The 403 for a rejected reviewer action. When the actor reached the record as its project PM the
     * message says the view is read-only; otherwise it is the caller's generic {@code fallback}.
     *
     * @param what plural noun for the message, e.g. "blockers" or "clarifications".
     */
    public static ResponseStatusException denial(boolean actorIsPmOfRecord, String what, String fallback) {
        if (actorIsPmOfRecord) {
            return new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Project Managers have a read-only view of " + what + ". Replies and changes are handled by Team Leads.");
        }
        return new ResponseStatusException(HttpStatus.FORBIDDEN, fallback);
    }

    public static ResponseStatusException denial(boolean actorIsPmOfRecord, String what) {
        return denial(actorIsPmOfRecord, what, "Access denied");
    }
}
