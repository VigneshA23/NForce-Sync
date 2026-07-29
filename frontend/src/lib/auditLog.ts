import { UserCog, ClipboardCheck, ShieldCheck, Settings, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuditLogDto } from '../api/admin';
import { toRole } from '../api/auth';
import { ROLE_LABELS } from './nav';

// ── Category taxonomy ──────────────────────────────────────────────────────────
// Only 'user-management' and 'eod-approval' are produced by the backend today
// (APP_USER / EOD_ENTRY entity types). 'role-change' is derived client-side by
// diffing before/after role on an APP_USER UPDATE. 'business-rule' is reserved
// for when that entity type starts writing audit rows.

export type AuditCategory = 'user-management' | 'eod-approval' | 'role-change' | 'business-rule' | 'other';

export const AUDIT_CATEGORY_ICONS: Record<AuditCategory, LucideIcon> = {
  'user-management': UserCog,
  'eod-approval':    ClipboardCheck,
  'role-change':     ShieldCheck,
  'business-rule':   Settings,
  other:             Activity,
};

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  'user-management': 'User management',
  'eod-approval':    'EOD approval',
  'role-change':     'Role change',
  'business-rule':   'Business rule',
  other:             'Other',
};

export interface AuditDisplay {
  message: string;
  category: AuditCategory;
}

function safeParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function roleLabel(backendRole: unknown): string {
  if (typeof backendRole !== 'string') return 'Unknown role';
  return ROLE_LABELS[toRole(backendRole)] ?? backendRole;
}

// Resolves raw audit-log entries into human-readable text + a category, e.g.
// "Created a new app_user" -> "Created employee profile: Jane Smith" (user-management)
// "performed EOD_APPROVED on eod_entry" -> "Approved Jane Smith's EOD entry — 2026-07-25" (eod-approval)
export function describeAuditEvent(event: AuditLogDto): AuditDisplay {
  const before = safeParse(event.beforeValue);
  const after  = safeParse(event.afterValue);
  const actor  = event.actorName ?? 'System';

  if (event.entityType === 'APP_USER') {
    const name = (after?.fullName as string | undefined)
      ?? (before?.fullName as string | undefined)
      ?? `user #${event.entityId ?? '?'}`;

    switch (event.action) {
      case 'CREATE':
        return { message: `Created employee profile: ${name}`, category: 'user-management' };
      case 'STATUS_CHANGE': {
        const activated = after?.status === 'ACTIVE';
        return { message: `${activated ? 'Activated' : 'Deactivated'}: ${name}`, category: 'user-management' };
      }
      case 'UPDATE': {
        const beforeRole = before?.role;
        const afterRole  = after?.role;
        if (beforeRole && afterRole && beforeRole !== afterRole) {
          return {
            message: `Changed ${name}'s role: ${roleLabel(beforeRole)} → ${roleLabel(afterRole)}`,
            category: 'role-change',
          };
        }
        return { message: `Updated employee profile: ${name}`, category: 'user-management' };
      }
      case 'PASSWORD_RESET':
        return { message: `Reset password for: ${name}`, category: 'user-management' };
      case 'SOFT_DELETE':
        return { message: `Deleted employee profile: ${name}`, category: 'user-management' };
      default:
        return { message: `${actor} performed ${event.action} on ${name}`, category: 'user-management' };
    }
  }

  if (event.entityType === 'EOD_ENTRY') {
    const name = (after?.employeeName as string | undefined) ?? `EOD entry #${event.entityId ?? '?'}`;
    const date = after?.entryDate as string | undefined;
    const dateSuffix = date ? ` — ${date}` : '';

    switch (event.action) {
      case 'EOD_APPROVED':
        return { message: `Approved ${name}'s EOD entry${dateSuffix}`, category: 'eod-approval' };
      case 'EOD_REJECTED':
        return { message: `Rejected ${name}'s EOD entry${dateSuffix}`, category: 'eod-approval' };
      case 'EOD_CHANGES_REQUESTED':
        return { message: `Requested changes on ${name}'s EOD entry${dateSuffix}`, category: 'eod-approval' };
      default:
        return { message: `${actor} performed ${event.action} on ${name}'s EOD entry${dateSuffix}`, category: 'eod-approval' };
    }
  }

  const entityLabel = event.entityType?.toLowerCase().replace(/_/g, ' ') ?? 'record';

  // BUSINESS_RULE rows exist in the audit trail (config-level changes) though no
  // current write path produces new ones — still categorize them distinctly rather
  // than falling into "other" if/when that feature returns.
  if (event.entityType === 'BUSINESS_RULE') {
    const name = (after?.name as string | undefined)
      ?? (after?.title as string | undefined)
      ?? (before?.name as string | undefined)
      ?? (before?.title as string | undefined);
    const suffix = name ? `: ${name}` : ` #${event.entityId ?? '?'}`;
    return { message: `${actor} ${event.action.toLowerCase()}d business rule${suffix}`, category: 'business-rule' };
  }

  return { message: `${actor} performed ${event.action} on ${entityLabel}`, category: 'other' };
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export function formatAuditDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function auditActionBadgeStyle(action: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    CREATE:                { bg: 'rgba(47,182,124,.12)',  color: '#2FB67C' },
    UPDATE:                { bg: 'rgba(76,141,214,.12)',  color: '#4C8DD6' },
    STATUS_CHANGE:         { bg: 'rgba(224,169,59,.12)',  color: '#E0A93B' },
    PASSWORD_RESET:        { bg: 'rgba(155,109,255,.12)', color: '#9B6DFF' },
    SOFT_DELETE:           { bg: 'rgba(228,55,61,.12)',   color: '#E4373D' },
    EOD_APPROVED:          { bg: 'rgba(47,182,124,.12)',  color: '#2FB67C' },
    EOD_REJECTED:          { bg: 'rgba(228,55,61,.12)',   color: '#E4373D' },
    EOD_CHANGES_REQUESTED: { bg: 'rgba(224,169,59,.12)',  color: '#E0A93B' },
  };
  return map[action] ?? { bg: 'var(--raised2)', color: 'var(--txt-dim)' };
}
