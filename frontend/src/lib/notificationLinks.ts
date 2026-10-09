/**
 * Whether a notification's "open related page" link is offered to the viewer.
 *
 * PM notifications are informational only — no link — EXCEPT the three EOD Clarification types.
 * A PM can be the escalated-to approver on a piece, in which case they must be able to reach the
 * thread. The destination (/projects/eod-inbox, chosen server-side per recipient) then follows the
 * server's canOpen / canReply flags, not the role: a PM who is only an observer lands on a
 * read-only thread, a PM who is the escalated approver gets the composer and the resolve control.
 * Every other PM notification keeps its previous behaviour.
 */
export const CLARIFICATION_NOTIFICATION_TYPES = [
  'EOD_CLARIFICATION_REQUESTED',
  'EOD_CLARIFICATION_REPLY',
  'EOD_CLARIFICATION_RESOLVED',
] as const;

export function isClarificationNotification(type: string): boolean {
  return (CLARIFICATION_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export function canOpenNotificationLink(role: string | undefined, type: string): boolean {
  if (role !== 'pm') return true;
  return isClarificationNotification(type);
}
