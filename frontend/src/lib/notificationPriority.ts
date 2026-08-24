/**
 * Centralized notification priority business logic.
 *
 * This replaces the old flat, hardcoded `priority` field that used to live
 * inline in `frontend/src/pages/Notifications.tsx`'s NOTIFICATION_META map.
 * Priority is still not sent by the backend (see NotificationDto) — this
 * module derives it from data the notification already carries: its `type`
 * (a business-impact classification) and, where present, a date or
 * percentage embedded in its `title`/`message` following the same string
 * conventions the backend already uses (e.g. ApprovalService embeds
 * "...for 2026-08-05..." in EOD notification messages).
 *
 * Adding a new notification type: add one line to BASE_PRIORITY_BY_TYPE.
 * Adding a new dynamic rule: add one case to resolveNotificationPriority.
 */

import type { NotificationDto } from '../api/notifications';
import { RULES } from './rules';
import { todayISO } from './date';

export type NotificationPriority = 'High' | 'Medium' | 'Low';

/**
 * Base business-impact classification per notification type.
 *
 * HIGH   — requires immediate employee action (rejections, corrections,
 *          missed/overdue submissions, critical utilization, urgent
 *          allocation changes).
 * MEDIUM — worth the employee's attention, but not urgent (assignments,
 *          manager comments, leave approvals, upcoming milestones,
 *          routine reminders/updates).
 * LOW    — purely informational (approvals of routine work, announcements,
 *          system/account confirmations).
 *
 * Types marked "not yet emitted by the backend" are kept so the moment the
 * backend starts sending them, no frontend change is needed — same pattern
 * the old NOTIFICATION_META map already used.
 */
const BASE_PRIORITY_BY_TYPE: Record<string, NotificationPriority> = {
  // ── High — immediate employee action required ──────────────────────────
  EOD_REJECTED: 'High',            // emitted today (ApprovalService.reject)
  EOD_CHANGES_REQUESTED: 'High',   // emitted today — "pending corrections from manager"
  PENDING_CORRECTION: 'High',      // not yet emitted
  BLOCKER_REPLY: 'High',           // emitted today (BlockerConversationService.postReplyAsLead)
  EOD_MISSED: 'High',              // not yet emitted
  EOD_OVERDUE: 'High',             // not yet emitted
  LEAVE_REJECTED: 'High',          // not yet emitted
  UTILIZATION_CRITICAL: 'High',    // not yet emitted

  // ── Medium — attention needed, not urgent ──────────────────────────────
  ACCOUNT_CREATED: 'Medium',       // emitted today (UserService)
  PASSWORD_RESET: 'Medium',        // emitted today (UserService)
  MANAGER_CHANGED: 'Medium',       // emitted today (UserService.updateUser)
  TEAM_MEMBER_ADDED: 'Medium',     // emitted today (UserService.updateUser)
  TEAM_MEMBER_REMOVED: 'Medium',   // emitted today (UserService.updateUser)
  EOD_REMINDER: 'Medium',          // not yet emitted — escalates to High if overdue, see below
  PROJECT_ASSIGNMENT: 'Medium',    // not yet emitted
  PROJECT_MILESTONE: 'Medium',     // not yet emitted — escalates near/at due date, see below
  MANAGER_COMMENT: 'Medium',       // not yet emitted
  RESOURCE_ALLOCATION: 'Medium',   // not yet emitted — escalates if flagged urgent, see below
  LEAVE_APPROVED: 'Medium',        // not yet emitted
  UTILIZATION_REMINDER: 'Medium',  // not yet emitted — escalates below threshold, see below

  // ── Low — informational ─────────────────────────────────────────────────
  EOD_APPROVED: 'Low',             // emitted today (ApprovalService.approveEntry)
  EOD_SUBMITTED: 'Low',            // not yet emitted
  HOLIDAY_ANNOUNCEMENT: 'Low',     // not yet emitted
  SYSTEM_ANNOUNCEMENT: 'Low',      // not yet emitted
  SYSTEM_MAINTENANCE: 'Low',       // not yet emitted
  PROFILE_UPDATED: 'Low',          // not yet emitted
};

const DEFAULT_PRIORITY: NotificationPriority = 'Low';

/**
 * Extracts a `YYYY-MM-DD` date embedded in notification text, matching the
 * convention the backend already uses for EOD notifications (e.g.
 * `"Your EOD entry for 2026-08-05 was rejected."` in ApprovalService).
 */
function extractEmbeddedDate(text: string): string | null {
  const match = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

/** Extracts a percentage figure embedded in notification text (e.g. "42%"). */
function extractPercentage(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : null;
}

/** Whole-day difference between two `yyyy-MM-dd` dates (negative = `to` is in the past). */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Determines a notification's business-impact priority.
 *
 * Starts from the base type classification above, then applies dynamic
 * escalation only where the notification's own title/message already
 * carries the data needed (a date, a percentage, an urgency keyword) — no
 * values are invented, and nothing here depends on data the notification
 * doesn't actually have.
 */
export function resolveNotificationPriority(n: NotificationDto): NotificationPriority {
  const base = BASE_PRIORITY_BY_TYPE[n.type] ?? DEFAULT_PRIORITY;
  const text = `${n.title} ${n.message ?? ''}`;

  switch (n.type) {
    // EOD reminder becomes High once its date is today or already passed (overdue).
    case 'EOD_REMINDER':
    case 'EOD_OVERDUE': {
      const entryDate = extractEmbeddedDate(text);
      if (entryDate) {
        const diff = daysBetween(todayISO(), entryDate);
        if (diff <= 0) return 'High';
      }
      return base;
    }

    // Upcoming milestone: Medium within 3 days of the date, High on/after the due date.
    case 'PROJECT_MILESTONE': {
      const dueDate = extractEmbeddedDate(text);
      if (dueDate) {
        const diff = daysBetween(todayISO(), dueDate);
        if (diff <= 0) return 'High';
        if (diff <= 3) return 'Medium';
      }
      return base;
    }

    // Utilization notice: High only when the embedded percentage is below the
    // existing configured "under-utilized" threshold (RULES.util.under) —
    // reuses the same threshold already driving utilization colors elsewhere.
    case 'UTILIZATION_CRITICAL':
    case 'UTILIZATION_REMINDER': {
      const pct = extractPercentage(text);
      if (pct != null) return pct < RULES.util.under ? 'High' : 'Medium';
      return base;
    }

    // Resource allocation: routine updates stay Medium; changes the message
    // itself flags as immediate/urgent escalate to High.
    case 'RESOURCE_ALLOCATION': {
      if (/\bimmediate(?:ly)?\b|\burgent\b/i.test(text)) return 'High';
      return base;
    }

    default:
      return base;
  }
}
