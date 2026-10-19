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
 * opening, replying as reviewer, or resolving — though they still approve / reject the pieces held by or
 * escalated to them. That is a CAPACITY, not a role (PmScopeService): the same user may be PM of some
 * projects and Team Lead of others, so a piece the actor holds as the project's PM (approver type PM) or
 * as the escalated-to PM gives no reviewer rights, whatever his role, while a piece he holds as the Team
 * Lead (LEAD) or the reporting manager (REPORTING_MANAGER) still does.
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
        return com.nforceone.sync.project.PmScopeService.entryTouchesManagedProject(actor, entry);
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
        return (actor.getRole() == AppUser.Role.ADMIN || actor.getRole() == AppUser.Role.SUPERADMIN)
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
        // A real capacity only — Team Lead / reporting-manager piece approver, or an Admin / Super Admin on an
        // ADMIN_GROUP piece. The Super Admin role alone no longer opens, replies to or resolves a thread on
        // any entry in the org; reading stays org-wide (canRead).
        return isPendingApprover(actor, pieces);
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
        if (canReview(actor, entry, pieces)) return;
        // Reached only as the project's PM (capacity, not role) -> read-only; otherwise the generic reason.
        throw PmReadOnlyPolicy.denial(isProjectPm(actor, entry), "clarifications",
                "Only an approver with a pending review on this entry can manage a clarification on it");
    }

    /** Reply: the owner (as the employee side) or a reviewer. */
    static void requireCanReply(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (canReply(actor, entry, pieces)) return;
        throw PmReadOnlyPolicy.denial(isProjectPm(actor, entry), "clarifications");
    }

    // ── per-round (per-piece) rules ───────────────────────────────────────────
    // A round belongs to ONE approval piece (project + lead). The entry-level rules above decide whether
    // the actor may touch clarifications on this entry at all; these decide which ROUNDS. A legacy round
    // (no piece) keeps the old entry-wide behaviour.

    /** The round's piece as it stands in the entry's current-cycle pieces, or null when the round has no
     *  piece or its piece was superseded (a resubmit started a new cycle). */
    private static EodProjectApproval currentPieceOf(EodClarification round, List<EodProjectApproval> pieces) {
        if (round.getPiece() == null) return null;
        return pieces.stream().filter(p -> p.getId().equals(round.getPiece().getId())).findFirst().orElse(null);
    }

    /** May the actor read this round's thread? Owner, Super Admin and the read-only RM / project PM see every
     *  round on the entry; a Team Lead (or any other approver) sees only the round on a piece he holds. */
    static boolean canReadRound(AppUser actor, EodEntry entry, EodClarification round, List<EodProjectApproval> pieces) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN
                || isOwningEmployee(actor, entry)
                || isFrozenRm(actor, entry)
                || isProjectPm(actor, entry)) {
            return true;
        }
        // A legacy round (no piece) is its opener's alone — NOT every approver on the entry, so another
        // project's lead can never read a thread that isn't theirs. The employee, Super Admin and the
        // read-only RM / PM were already let through above, exactly as for a piece-keyed round.
        if (round.getPiece() == null) return round.getOpenedBy().getId().equals(actor.getId());
        return isApproverOf(actor, round.getPiece());
    }

    /** May the actor reply as the reviewing side of / resolve this round? Only the reviewer holding the
     *  round's own still-pending piece — never the owner, never another project's lead. */
    static boolean canReviewRound(AppUser actor, EodEntry entry, EodClarification round, List<EodProjectApproval> pieces) {
        if (isOwningEmployee(actor, entry)) return false;
        // Legacy round: only its opener, and only while he still holds a pending reviewing piece.
        if (round.getPiece() == null) {
            return round.getOpenedBy().getId().equals(actor.getId()) && canReview(actor, entry, pieces);
        }
        EodProjectApproval piece = currentPieceOf(round, pieces);
        return piece != null
                && piece.getStatus() == EodProjectApproval.Status.PENDING
                && isReviewerOf(actor, piece);
    }

    /** May the actor post into this round: the owner (employee side) or the round's own reviewer. */
    static boolean canReplyRound(AppUser actor, EodEntry entry, EodClarification round, List<EodProjectApproval> pieces) {
        return isOwningEmployee(actor, entry) || canReviewRound(actor, entry, round, pieces);
    }

    /** Pieces the actor could open a NEW round on: still pending and held in a reviewing capacity. */
    static List<EodProjectApproval> openablePieces(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (isOwningEmployee(actor, entry)) return List.of();
        return pieces.stream()
                .filter(p -> p.getStatus() == EodProjectApproval.Status.PENDING && isReviewerOf(actor, p))
                .toList();
    }

    /** Read: owner, any current approver, frozen RM, project PM, or Super Admin. */
    static void requireCanRead(AppUser actor, EodEntry entry, List<EodProjectApproval> pieces) {
        if (canRead(actor, entry, pieces)) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied");
    }
}
