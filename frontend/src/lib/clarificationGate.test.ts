import { describe, expect, it } from 'vitest';
import {
  CLARIFICATION_BLOCKS_DECISION_REASON, clarificationMenuState, decisionBlockedReason, isBlockingStatus,
  isStaleStateError, scopeFor, type MenuStatus,
} from './clarificationGate';

describe('scopeFor — which side of the conversation the viewer is on', () => {
  const ME = 7;

  it("is 'employee' on the viewer's own entry", () => {
    expect(scopeFor(ME, ME)).toBe('employee');
  });

  it("is 'lead' (reviewer) on someone else's entry", () => {
    expect(scopeFor(42, ME)).toBe('lead');
  });

  it('dual-role user: the same viewer gets opposite scopes for own entry vs a report entry', () => {
    const ownEntryOwner = ME;       // the user's own EOD
    const reportEntryOwner = 42;    // an EOD they review
    expect(scopeFor(ownEntryOwner, ME)).toBe('employee');
    expect(scopeFor(reportEntryOwner, ME)).toBe('lead');
    expect(scopeFor(ownEntryOwner, ME)).not.toBe(scopeFor(reportEntryOwner, ME));
  });

  it('the report, viewed by the reviewer and by themselves, flips sides', () => {
    expect(scopeFor(42, ME)).toBe('lead');       // reviewer looking at report's entry
    expect(scopeFor(42, 42)).toBe('employee');   // the report looking at their own entry
  });

  it('depends only on ids — an id match is the only way to be the employee side', () => {
    expect(scopeFor(1, 2)).toBe('lead');
    expect(scopeFor(2, 1)).toBe('lead');
    expect(scopeFor(3, 3)).toBe('employee');
  });
});

describe('isBlockingStatus — when Approve/Reject must be disabled', () => {
  it('blocks while a round is NEEDS_RESPONSE or ACKNOWLEDGED', () => {
    expect(isBlockingStatus('NEEDS_RESPONSE')).toBe(true);
    expect(isBlockingStatus('ACKNOWLEDGED')).toBe(true);
  });

  it('does not block once RESOLVED, or when there is no round', () => {
    expect(isBlockingStatus('RESOLVED')).toBe(false);
    expect(isBlockingStatus(null)).toBe(false);
    expect(isBlockingStatus(undefined)).toBe(false);
  });

  it('is entry-wide: the same status blocks every piece, so it takes no piece argument', () => {
    // Rounds are per entry. The decision is a function of the entry's round status only; two
    // pieces on one entry therefore always get the same answer.
    const roundStatus = 'ACKNOWLEDGED' as const;
    const pieceA = isBlockingStatus(roundStatus);
    const pieceB = isBlockingStatus(roundStatus);
    expect(pieceA).toBe(true);
    expect(pieceB).toBe(true);
  });
});

describe('decisionBlockedReason', () => {
  it('returns the tooltip only when blocked, and it says every project piece is blocked', () => {
    expect(decisionBlockedReason(false)).toBeUndefined();
    const reason = decisionBlockedReason(true);
    expect(reason).toBe(CLARIFICATION_BLOCKS_DECISION_REASON);
    expect(reason).toContain('every project piece');
    expect(reason).toContain('open clarification');
  });
});

describe('isStaleStateError — refetch the round status instead of waiting for the poll', () => {
  const http = (status: number) => ({ response: { status } });

  it('treats 403 and 409 as stale state', () => {
    expect(isStaleStateError(http(403))).toBe(true);
    expect(isStaleStateError(http(409))).toBe(true);
  });

  it('ignores other failures and non-HTTP errors', () => {
    expect(isStaleStateError(http(400))).toBe(false);
    expect(isStaleStateError(http(500))).toBe(false);
    expect(isStaleStateError(new Error('network'))).toBe(false);
    expect(isStaleStateError(null)).toBe(false);
    expect(isStaleStateError(undefined)).toBe(false);
  });
});

describe('clarificationMenuState — kebab menu rules', () => {
  const none: MenuStatus = { open: false, status: null, canOpen: true };
  const open: MenuStatus = { open: true, status: 'NEEDS_RESPONSE', canOpen: false };
  const acknowledged: MenuStatus = { open: true, status: 'ACKNOWLEDGED', canOpen: false };
  const resolvedCanOpen: MenuStatus = { open: false, status: 'RESOLVED', canOpen: true };
  const resolvedReadOnly: MenuStatus = { open: false, status: 'RESOLVED', canOpen: false };
  const noAccessToOpen: MenuStatus = { open: false, status: null, canOpen: false };

  const kinds = (s: ReturnType<typeof clarificationMenuState>) => s.clarification.map(c => c.kind);

  it('no round: Approve/Reject enabled, Request Clarification offered when canOpen', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: none });
    expect(s.approve.disabled).toBe(false);
    expect(s.reject.disabled).toBe(false);
    expect(s.approve.title).toBeUndefined();
    expect(kinds(s)).toEqual(['request']);
  });

  it('NEEDS_RESPONSE and ACKNOWLEDGED disable Approve and Reject with the entry-wide tooltip', () => {
    for (const status of [open, acknowledged]) {
      const s = clarificationMenuState({ isOwn: false, blockedByList: false, status });
      expect(s.approve.disabled).toBe(true);
      expect(s.reject.disabled).toBe(true);
      expect(s.approve.title).toBe(CLARIFICATION_BLOCKS_DECISION_REASON);
      expect(s.reject.title).toContain('every project piece');
      expect(kinds(s)).toEqual(['open-chat']);
      expect(s.clarification[0].label).toBe('Open clarification chat');
    }
  });

  it('a resolved round re-enables Approve/Reject but keeps the thread readable', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: resolvedReadOnly });
    expect(s.approve.disabled).toBe(false);
    expect(s.reject.disabled).toBe(false);
    expect(kinds(s)).toEqual(['view-resolved']);
  });

  it('after a resolved round the reviewer can both start a new round and view the previous one', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: resolvedCanOpen });
    expect(kinds(s)).toEqual(['request', 'view-resolved']);
  });

  it('a viewer with no round and no canOpen (e.g. read-only RM) gets no clarification item', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: noAccessToOpen });
    expect(s.clarification).toEqual([]);
  });

  it('own entry never gets a clarification item, in any state', () => {
    for (const status of [none, open, resolvedCanOpen, resolvedReadOnly, undefined]) {
      const s = clarificationMenuState({ isOwn: true, blockedByList: status === undefined, status });
      expect(s.clarification).toEqual([]);
    }
  });

  it('while the row status loads, the batched list decides blocking and a disabled placeholder shows', () => {
    const idle = clarificationMenuState({ isOwn: false, blockedByList: false, status: undefined });
    expect(idle.approve.disabled).toBe(false);
    expect(idle.clarification).toEqual([{ kind: 'loading', label: 'Request Clarification', disabled: true }]);

    const knownOpen = clarificationMenuState({ isOwn: false, blockedByList: true, status: undefined });
    expect(knownOpen.approve.disabled).toBe(true);
    expect(kinds(knownOpen)).toEqual(['open-chat']);
  });

  it("the row's own status overrides a stale batched list (round just resolved)", () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: true, status: resolvedCanOpen });
    expect(s.approve.disabled).toBe(false);
    expect(s.reject.disabled).toBe(false);
  });

  it('an in-flight action disables Approve/Reject without changing the clarification items', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: none, busy: true });
    expect(s.approve.disabled).toBe(true);
    expect(s.approve.title).toBeUndefined();
    expect(kinds(s)).toEqual(['request']);
  });

  it('dual-role user: no clarification item on their own entry, a full menu on a report entry', () => {
    const ownEntry = clarificationMenuState({ isOwn: true, blockedByList: false, status: none });
    const reportEntry = clarificationMenuState({ isOwn: false, blockedByList: false, status: none });
    expect(ownEntry.clarification).toEqual([]);
    expect(kinds(reportEntry)).toEqual(['request']);
  });
});

describe('clarificationMenuState — read-only reviewer (Project Manager)', () => {
  const none: MenuStatus = { open: false, status: null, canOpen: true };
  const open: MenuStatus = { open: true, status: 'NEEDS_RESPONSE', canOpen: false };
  const resolved: MenuStatus = { open: false, status: 'RESOLVED', canOpen: true };
  const kinds = (s: ReturnType<typeof clarificationMenuState>) => s.clarification.map(c => c.kind);

  it('never offers Request Clarification, even when the flags would allow it', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: none, readOnlyReviewer: true });
    expect(s.clarification).toEqual([]);
  });

  it('shows no loading placeholder either (nothing that looks like Request Clarification flashes up)', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: undefined, readOnlyReviewer: true });
    expect(s.clarification).toEqual([]);
  });

  it('an open round is only ever viewable: "View clarification chat"', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: open, readOnlyReviewer: true });
    expect(s.clarification).toEqual([{ kind: 'open-chat', label: 'View clarification chat', disabled: false }]);
  });

  it('a round known open from the batched list is viewable before the row status loads', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: true, status: undefined, readOnlyReviewer: true });
    expect(kinds(s)).toEqual(['open-chat']);
    expect(s.clarification[0].label).toBe('View clarification chat');
  });

  it('a resolved thread stays readable and is NOT offered as a new request', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: resolved, readOnlyReviewer: true });
    expect(kinds(s)).toEqual(['view-resolved']);
  });

  it('Approve / Reject follow the same blocking rules as for any reviewer', () => {
    const blocked = clarificationMenuState({ isOwn: false, blockedByList: false, status: open, readOnlyReviewer: true });
    expect(blocked.approve.disabled).toBe(true);
    const free = clarificationMenuState({ isOwn: false, blockedByList: false, status: none, readOnlyReviewer: true });
    expect(free.approve.disabled).toBe(false);
    expect(free.reject.disabled).toBe(false);
  });

  it('a non-read-only reviewer is unchanged (regression)', () => {
    const s = clarificationMenuState({ isOwn: false, blockedByList: false, status: none });
    expect(kinds(s)).toEqual(['request']);
    const o = clarificationMenuState({ isOwn: false, blockedByList: false, status: open });
    expect(o.clarification[0].label).toBe('Open clarification chat');
  });
});
