package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.PmReadOnlyPolicy;
import com.nforceone.sync.project.Project;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

/**
 * Shared access rules for the EOD Clarification conversation — mirrors EodAccessPolicy's shape
 * (a package-private static class) rather than Blockers' inline-per-service-method checks.
 *
 * Reviewer authority follows the entry's CURRENT-cycle approval pieces, the same source
 * ApprovalPieceService.checkApproverAuthorization uses: a user is a reviewer when they are the
 * approver or the escalated-to PM of a still-PENDING piece (or an Admin on a PENDING ADMIN_GROUP
 * piece), or a Super Admin. It is evaluated live on every call, so when a piece's approver changes
 * (escalation, resubmit into a new cycle, a future reassign) the previous approver loses access
 * and the current one gains it, mid-thread. opened_by_approver_id is never consulted here.
 *
 * Read-only tiers (no open, no reply): the frozen reporting manager (entry.managerId) and any
 * project PM on the entry's tasks — unless they are also a reviewer under the rule above.
 *
 * Project Managers are READ-ONLY: they can read any thread they can see, but never review it — no
 * opening, replying as reviewer, or resolving — though they still approve / reject pieces. That holds
 * in two ways, because in this app anyone can be a project's PM by assignment, not only a user whose
 * role is PM:
 *   - by ROLE: a user with role PM is never a reviewer (see PmReadOnlyPolicy);
 *   - by CAPACITY: a piece the actor holds as the project's PM (approver type PM) or as the
 *     escalated-to PM gives them no reviewer rights, whatever their role. A piece they hold as the
 *     Team Lead (LEAD) or the reporting manager (REPORTING_MANAGER) still does.
 * A PM replying on their OWN EOD is the owner (employee side), not a reviewer, and is unaffected.
 *
 * Nobody can act as reviewer on their own EOD, whatever their capabilities: the self-block runs
 * before the Super Admin bypass. The owner can still reply — as the employee.
 *
 * {@code pieces} is the entry's current-cycle pieces (EodProjectApprovalRepository#findByEodEntryId,
 * which already excludes superseded rows); the policy stays repository-free so it is unit-testable.
 */
final class EodClarificationAccessPolicy {
    private EodClarificationAccessPolicy() {}

    static boolean isOwningEmployee(AppUser actor, EodEntry entry) {
        return entry.getEmployee().getId().equals(actor.getId());
    }

    /** Frozen reporting manager (entry.managerId stamped at first submit) — read-only. */
    static boolean isFrozenRm(AppUser actor, EodEntry entry) {
        return entry.getManagerId() != null && entry.getManagerId().equals(actor.getId());
    }

    /** Any project in the entry's tasks has this actor as its PM — read-only. */
    static boolean isProjectPm(AppUser actor, EodEntry entry) {
        return entry.getTasks().stream()
                .map(EodTask::getProject).filter(Objects::nonNull)
                .map(Project::getPm).filter(Objects::nonNull)
                .anyMatch(pm -> pm.getId().equals(actor.getId()));
    }

    /** Same approver test as ApprovalPieceService.checkApproverAuthorization (minus Super Admin). */
    static boolean isApproverOf(AppUser actor, EodProjectApproval piece) {
        if (piece.getApprover() != null && piece.getApprover().getId().equals(actor.getId())) return true;
        if (piece.getEscalatedTo() != null && piece.getEscalatedTo().getId().equals(actor.getId())) return true;
        return actor.getRole() == AppUser.Role.ADMIN
                && piece.getApproverType() == EodProjectApproval.ApproverType.ADMIN_GROUP;
    }

    /** Approver of any current-cycle piece, decided or pending — used for read access and for
     *  recording opened_by_approver_id. */
    static boolean isCurrentApprover(AppUser actor, List<EodProjectApproval> pieces) {
        return pieces.stream().anyMatch(p -> isApproverOf(actor, p));
    }

    /** True when the actor holds this piece in a REVIEWING capacity: its Team Lead / reporting-manager
     *  approver, or an Admin on an ADMIN_GROUP piece. Deliberately NOT the project-PM capacity (a piece
     *  whose approver type is PM, or one escalated to the actor) — a PM is read-only on clarifications. */
    static boolean isReviewerOf(AppUser actor, EodProjectApproval piece) {
        if (piece.getApproverType() != EodProjectApproval.ApproverType.PM
                && piece.getApprover() != null && piece.getApprover().getId().equals(actor.getId())) {
            return true;
        }
        return actor.getRole() == AppUser.Role.ADMIN
                && piece.getApproverType() == EodProjectApproval.ApproverType.ADMIN_GROUP;
    }

    /** Reviewer of a piece that is still PENDING — a reviewer whose piece is already approved or
     *  rejected has nothing left to clarify, so they cannot open or drive a round. */
    static boolean isPendingApprover(AppUser actor, List<EodProjectApproval> pieces) {
        return pieces.stream()
                .filter(p -> p.getStatus() == EodProjectApproval.Status.PENDING)
                .anyMatch(p -> isReviewerOf(actor, p));
    }

    /** True when the actor may open / resolve / reply as the reviewing side of this entry. */
    static boolean canReview(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (isOwningEmployee(actor, entry)) return false;
        if (PmReadOnlyPolicy.isReadOnlyPm(actor)) return false;
        return actor.getRole() == AppUser.Role.SUPERADMIN || isPendingApprover(actor, pieces);
    }

    /** True when the actor may post into a round: the owner (as employee) or a reviewer. */
    static boolean canReply(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        return isOwningEmployee(actor, entry) || canReview(actor, entry, pieces);
    }

    /** True when the actor may read the thread. */
    static boolean canRead(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        return actor.getRole() == AppUser.Role.SUPERADMIN
                || isOwningEmployee(actor, entry)
                || isCurrentApprover(actor, pieces)
                || isFrozenRm(actor, entry)
                || isProjectPm(actor, entry);
    }

    /** Open / resolve / set status. Self-block first (before the Super Admin bypass). */
    static void requireCanOpenOrResolve(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (isOwningEmployee(actor, entry)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You cannot manage a clarification as a reviewer on your own EOD entry");
        }
        PmReadOnlyPolicy.requireNotReadOnlyPm(actor, "clarifications");
        if (canReview(actor, entry, pieces)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only an approver with a pending review on this entry can manage a clarification on it");
    }

    /** Reply: the owner (as the employee side) or a reviewer. */
    static void requireCanReply(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (canReply(actor, entry, pieces)) return;
        PmReadOnlyPolicy.requireNotReadOnlyPm(actor, "clarifications");   // clearer than a bare "Access denied"
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
    }

    /** Read: owner, any current approver, frozen RM, project PM, or Super Admin. */
    static void requireCanRead(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (canRead(actor, entry, pieces)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
    }
}
