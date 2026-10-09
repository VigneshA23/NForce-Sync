import type { ClarificationScope, ClarificationStatusValue } from '../api/eodClarification';

// Pure helpers behind the EOD Clarification UI. Kept free of React/axios so the rules that
// matter most — which side of the conversation a viewer is on, when Approve/Reject must be
// disabled, and what the three-dots menu offers — are unit-tested (see clarificationGate.test.ts),
// the same pattern approvalsTabSplit.ts uses.

/**
 * Which side of a clarification the VIEWER is on for a given entry, decided by ownership alone —
 * never by the page they happen to be on. A user who is both an employee and a reviewer is the
 * 'employee' on their own entry and the 'lead' (reviewer) on a report's entry, so the same user
 * can never be offered reviewer actions on their own EOD, or the employee composer on a report's.
 * The scope also keys the React Query caches, so the two threads never share an entry.
 */
export function scopeFor(entryOwnerId: number, viewerId: number): ClarificationScope {
  return entryOwnerId === viewerId ? 'employee' : 'lead';
}

/** A round in either of these states blocks approve/reject (mirrors the server: status <> RESOLVED). */
export function isBlockingStatus(status: ClarificationStatusValue | null | undefined): boolean {
  return status === 'NEEDS_RESPONSE' || status === 'ACKNOWLEDGED';
}

/**
 * Tooltip for a disabled Approve/Reject. Rounds are per ENTRY (per-piece scoping is deferred), so
 * an open round blocks every project piece on the entry, not only the piece it was raised from.
 */
export const CLARIFICATION_BLOCKS_DECISION_REASON =
  'This entry has an open clarification (Needs response / Acknowledged). It blocks approving or '
  + 'rejecting every project piece on the entry until it is resolved.';

/** The tooltip to show on a decision button, or undefined when the button is not blocked. */
export function decisionBlockedReason(blocked: boolean): string | undefined {
  return blocked ? CLARIFICATION_BLOCKS_DECISION_REASON : undefined;
}

/**
 * Whether a failed clarification / approve / reject call means our cached round status or viewer
 * flags are stale (403: access moved; 409: a round was opened or resolved meanwhile) and should be
 * re-fetched immediately rather than waiting for the next 15s poll.
 */
export function isStaleStateError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null | undefined)?.response?.status;
  return status === 403 || status === 409;
}

// ── kebab-menu state ───────────────────────────────────────────────────────────

/** The slice of EodClarificationStatusDto the menu needs. */
export interface MenuStatus {
  open: boolean;
  status: ClarificationStatusValue | null;
  canOpen: boolean;
}

export type ClarificationMenuKind = 'request' | 'open-chat' | 'view-resolved' | 'loading';

export interface ClarificationMenuItem {
  kind: ClarificationMenuKind;
  label: string;
  disabled: boolean;
}

export interface ClarificationMenuState {
  approve: { disabled: boolean; title: string | undefined };
  reject: { disabled: boolean; title: string | undefined };
  /** Zero, one or two clarification entries — empty when there is nothing the viewer may do. */
  clarification: ClarificationMenuItem[];
}

/**
 * What the three-dots menu on an approval row shows, from the server's flags alone — no approver
 * rule is re-derived here.
 *
 * - Approve / Reject are disabled (with the entry-wide tooltip) while a round is NEEDS_RESPONSE or
 *   ACKNOWLEDGED, or while an action is in flight. The row's own status wins over the batched
 *   list once it has loaded.
 * - Clarification entries: none at all on the viewer's own entry; "Open clarification chat" when a
 *   round is open; "Request Clarification" when the server says canOpen; a resolved thread stays
 *   readable via "View previous clarification" (and, if canOpen, a new round can still be started);
 *   a viewer with nothing they may open or view (e.g. a read-only RM) gets no item.
 * - While the per-row status has not loaded yet (status === undefined), a disabled
 *   "Request Clarification" placeholder is shown unless the batched list already knows a round is open.
 * - A READ-ONLY reviewer (a Project Manager) can never raise a clarification, so for them there is no
 *   "Request Clarification" and no loading placeholder: only "View clarification chat" when a round
 *   is open and "View previous clarification" for a resolved one. Approve / Reject are unaffected.
 */
export function clarificationMenuState(input: {
  isOwn: boolean;
  /** Round open per the batched inbox list — the fallback until `status` loads. */
  blockedByList: boolean;
  /** The row's own status, or undefined while it is still loading. */
  status: MenuStatus | undefined;
  /** An approve / reject request is already in flight. */
  busy?: boolean;
  /** Project Manager: may view clarification threads, never raise one (see lib/pmReadOnly.ts). */
  readOnlyReviewer?: boolean;
}): ClarificationMenuState {
  const { isOwn, blockedByList, status, busy = false, readOnlyReviewer = false } = input;
  const blocked = status ? isBlockingStatus(status.status) : blockedByList;
  const decisionTitle = decisionBlockedReason(blocked);

  const clarification: ClarificationMenuItem[] = [];
  if (!isOwn) {
    if (blocked || status?.open) {
      clarification.push({
        kind: 'open-chat', disabled: false,
        label: readOnlyReviewer ? 'View clarification chat' : 'Open clarification chat',
      });
    } else if (readOnlyReviewer) {
      if (status?.status === 'RESOLVED') {
        clarification.push({ kind: 'view-resolved', label: 'View previous clarification', disabled: false });
      }
    } else if (status === undefined) {
      clarification.push({ kind: 'loading', label: 'Request Clarification', disabled: true });
    } else {
      if (status.canOpen) {
        clarification.push({ kind: 'request', label: 'Request Clarification', disabled: false });
      }
      if (status.status === 'RESOLVED') {
        clarification.push({ kind: 'view-resolved', label: 'View previous clarification', disabled: false });
      }
    }
  }

  return {
    approve: { disabled: blocked || busy, title: decisionTitle },
    reject: { disabled: blocked || busy, title: decisionTitle },
    clarification,
  };
}
