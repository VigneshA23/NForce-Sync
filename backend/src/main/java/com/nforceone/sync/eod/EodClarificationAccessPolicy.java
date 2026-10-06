package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Objects;

/**
 * Shared access rules for the EOD Clarification conversation — mirrors EodAccessPolicy's shape
 * (a package-private static class) rather than Blockers' inline-per-service-method checks, per
 * this feature's explicit convention. Expanded in parity with BlockerConversationService:
 * open/resolve/reply is now allowed by the frozen RM, any project lead, and any project PM
 * on the entry — not just the frozen RM.
 */
final class EodClarificationAccessPolicy {
    private EodClarificationAccessPolicy() {}

    static boolean isOwningEmployee(AppUser actor, EodEntry entry) {
        return entry.getEmployee().getId().equals(actor.getId());
    }

    /** Frozen reporting manager (entry.managerId stamped at first submit). */
    static boolean isFrozenRm(AppUser actor, EodEntry entry) {
        return entry.getManagerId() != null && entry.getManagerId().equals(actor.getId());
    }

    /** Any project in the entry's tasks has this actor as its lead. */
    static boolean isProjectLead(AppUser actor, EodEntry entry) {
        return entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull)
                .map(Project::getLead).filter(Objects::nonNull)
                .anyMatch(lead -> lead.getId().equals(actor.getId()));
    }

    /** Any project in the entry's tasks has this actor as its PM. */
    static boolean isProjectPm(AppUser actor, EodEntry entry) {
        return entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull)
                .map(Project::getPm).filter(Objects::nonNull)
                .anyMatch(pm -> pm.getId().equals(actor.getId()));
    }

    /** Legacy alias — frozen RM check (kept so callers in EodClarificationService compile). */
    static boolean isOwningLead(AppUser actor, EodEntry entry) {
        return isFrozenRm(actor, entry);
    }

    static boolean isScopedPm(AppUser actor, EodEntry entry) {
        if (actor.getRole() != AppUser.Role.PM) return false;
        return isProjectPm(actor, entry);
    }

    /** Open/resolve: frozen RM, project lead, project PM, or Superadmin.
     *  Mirrors BlockerConversationService.requireLeadOwnsTask (gap 3 fix). */
    static void requireCanOpenOrResolve(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (isFrozenRm(actor, entry) || isProjectLead(actor, entry) || isProjectPm(actor, entry)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only this employee's reporting manager, project lead, or project PM can manage a clarification on this entry");
    }

    /** Reply: owning employee, frozen RM, project lead, project PM, or Superadmin. */
    static void requireCanReply(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (isOwningEmployee(actor, entry) || isFrozenRm(actor, entry)
                || isProjectLead(actor, entry) || isProjectPm(actor, entry)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
    }

    /** Reading — owning employee, frozen RM, project lead, project PM, or Superadmin. */
    static void requireCanRead(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;
        if (isOwningEmployee(actor, entry) || isFrozenRm(actor, entry)
                || isProjectLead(actor, entry) || isProjectPm(actor, entry)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
    }
}
