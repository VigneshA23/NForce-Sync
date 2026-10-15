/**
 * Whether a notification's "open related page" link is offered to the viewer.
 *
 * PM notifications are informational only — no link — EXCEPT the three EOD Clarification types and the
 * escalation notice. A PM can be the escalated-to approver on a piece, in which case they must be able to
 * reach the thread (clarification) or the approval itself (escalation). The clarification destination
 * (/projects/eod-inbox, chosen server-side per recipient) then follows the server's canOpen / canReply
 * flags, not the role. Every other PM notification keeps its previous behaviour.
 */
export const CLARIFICATION_NOTIFICATION_TYPES = [
  'EOD_CLARIFICATION_REQUESTED',
  'EOD_CLARIFICATION_REPLY',
  'EOD_CLARIFICATION_RESOLVED',
] as const;

export function isClarificationNotification(type: string): boolean {
  return (CLARIFICATION_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** The `type` the backend stores and sends (EscalationScheduler) when it escalates a piece to the PM. */
export const ESCALATION_PM_NOTIFIED = 'ESCALATION_PM_NOTIFIED';

/** The fields of a notification that a related-page route may be built from. */
export interface RelatedNotification {
  id: number;
  type: string;
  link: string | null;
  read: boolean;
  employeeId?: number | null;
  pieceId?: number | null;
  eodDate?: string | null;
}

/**
 * Types whose destination is built client-side from structured ids (never from `link` or the message
 * text). A builder returns null when a required id is missing — e.g. rows created before the ids were
 * stored — and the button is then simply not shown.
 */
export const RELATED_ROUTE_BUILDERS: Record<string, (n: RelatedNotification) => string | null> = {
  [ESCALATION_PM_NOTIFIED]: (n) => {
    if (!n.employeeId || !n.pieceId) return null;
    const params = new URLSearchParams({ employeeId: String(n.employeeId), highlight: String(n.pieceId) });
    if (n.eodDate) params.set('date', n.eodDate);
    return `/projects/approvals?${params.toString()}`;
  },
};

/** Types a PM may open even though PM notifications are otherwise informational. */
export const PM_OPENABLE_RELATED_TYPES: readonly string[] = [ESCALATION_PM_NOTIFIED];

export function canOpenNotificationLink(role: string | undefined, type: string): boolean {
  // A client-built route (the escalation notice → the PM's own Approvals page) is for the PM alone.
  if (type in RELATED_ROUTE_BUILDERS && role !== 'pm') return false;
  if (role !== 'pm') return true;
  return isClarificationNotification(type) || PM_OPENABLE_RELATED_TYPES.includes(type);
}

/** Where "Open related page" goes for this viewer, or null when the button must not be shown. */
export function resolveRelatedPageHref(role: string | undefined, n: RelatedNotification): string | null {
  if (!canOpenNotificationLink(role, n.type)) return null;
  const build = RELATED_ROUTE_BUILDERS[n.type];
  return build ? build(n) : n.link || null;
}

/** Clicking "Open related page" marks the notification read — unless it already is. */
export function markReadOnOpen(n: Pick<RelatedNotification, 'id' | 'read'>, markRead: (id: number) => void): void {
  if (!n.read) markRead(n.id);
}
