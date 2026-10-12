/**
 * Which unread-clarification count a sidebar EOD-inbox item shows.
 *
 * Keyed by the item's PATH, not its nav key: a project lead has two inbox items that share a label
 * family but not a list — "My Work > EOD Inbox" (/employee/eod-inbox, threads raised on the
 * viewer's OWN EODs) and "Team Lead > Team Inbox" (/team/eod-inbox, threads the viewer reviews).
 * Their nav keys differ (`emp-eod-inbox` vs `eod-inbox`), and the old key-based lookup only ever
 * matched the second, so a lead never saw an unread badge on their own inbox. The two lists never
 * overlap (the reviewer list excludes the viewer's own entries), so the counts add nothing twice.
 */
export interface InboxCounts {
  /** Unread rounds on the viewer's own EODs (/employee/eod-inbox). */
  own: number;
  /** Unread rounds the viewer reviews as Team Lead / reporting manager (/team/eod-inbox). */
  team: number;
  /** Unread rounds in the PM's read-only inbox (/projects/eod-inbox). */
  pm: number;
}

export function inboxBadgeFor(item: { path?: string }, counts: InboxCounts): number | undefined {
  switch (item.path) {
    case '/employee/eod-inbox': return counts.own;
    case '/team/eod-inbox':     return counts.team;
    case '/projects/eod-inbox': return counts.pm;
    default:                    return undefined;
  }
}
