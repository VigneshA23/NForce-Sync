package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Objects;

/**
 * Shared access rules for the EOD Clarification conversation — mirrors EodAccessPolicy's shape
 * (a package-private static class) rather than Blockers' inline-per-service-method checks, per
 * this feature's explicit convention. PM's "read-only, no reply" scoping is additionally
 * reinforced by controller wiring: no reply/resolve endpoint is ever wired to a PM controller,
 * the same belt-and-suspenders pattern PmBlockersController already uses.
 */
final class EodClarificationAccessPolicy {
    private EodClarificationAccessPolicy() {}

    static boolean isOwningEmployee(AppUser actor, EodEntry entry) {
        return entry.getEmployee().getId().equals(actor.getId());
    }

    static boolean isOwningLead(AppUser actor, EodEntry entry) {
        return entry.getManagerId() != null && entry.getManagerId().equals(actor.getId());
    }

    static boolean isScopedPm(AppUser actor, EodEntry entry) {
        if (actor.getRole() != AppUser.Role.PM) return false;
        return entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull)
                .map(Project::getProjectManager).filter(Objects::nonNull)
                .anyMatch(pm -> pm.getId().equals(actor.getId()));
    }

    /** TL opening/resolving a round, or Superadmin. */
    static void requireCanOpenOrResolve(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (!isOwningLead(actor, entry)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only this employee's Team Lead can manage a clarification on this entry");
        }
    }

    /** Replying — either the owning TL or the entry's own employee. */
    static void requireCanReply(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (!isOwningLead(actor, entry) && !isOwningEmployee(actor, entry)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
        }
    }

    /** Reading — owning employee, owning TL, scoped PM, or Superadmin. */
    static void requireCanRead(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (isOwningEmployee(actor, entry) || isOwningLead(actor, entry) || isScopedPm(actor, entry)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
    }
}
