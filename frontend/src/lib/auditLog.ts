import { UserCog, ClipboardCheck, ShieldCheck, Settings, Activity, FileClock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AuditLogDto } from '../api/admin';
import { toRole } from '../api/auth';
import { ROLE_LABELS } from './nav';
import { formatDateTime } from './date';

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

export function roleLabel(backendRole: unknown): string {
  if (typeof backendRole !== 'string') return 'Unknown role';
  return ROLE_LABELS[toRole(backendRole)] ?? backendRole;
}

// ── Entity type display (icon + label) — the 3 entity types the backend actually writes today
// (APP_USER, EOD_ENTRY, BUSINESS_RULE). See AuditLogController/writeAudit call sites.
export const ENTITY_TYPE_META: Record<string, { label: string; icon: LucideIcon }> = {
  APP_USER:     { label: 'User',          icon: UserCog },
  EOD_ENTRY:    { label: 'EOD Entry',      icon: ClipboardCheck },
  BUSINESS_RULE: { label: 'Business Rule', icon: Settings },
};

export function entityTypeMeta(entityType: string): { label: string; icon: LucideIcon } {
  return ENTITY_TYPE_META[entityType] ?? { label: entityType.replace(/_/g, ' '), icon: FileClock };
}

// ── Action filter options — the Action dropdown's 8 values, each mapped to the actual stored
// action string (and, for Activate/Deactivate, the afterStatus split — see
// AuditLogSpecs.afterStatusIs) rather than renaming what's already written to the DB.
export interface AuditActionOption {
  key: string;
  label: string;
  action: string;
  afterStatus?: string;
}

export const AUDIT_ACTION_OPTIONS: AuditActionOption[] = [
  { key: 'CREATE',         label: 'Create',         action: 'CREATE' },
  { key: 'UPDATE',         label: 'Update',         action: 'UPDATE' },
  { key: 'DELETE',         label: 'Delete',         action: 'SOFT_DELETE' },
  { key: 'ACTIVATE',       label: 'Activate',       action: 'STATUS_CHANGE', afterStatus: 'ACTIVE' },
  { key: 'DEACTIVATE',     label: 'Deactivate',     action: 'STATUS_CHANGE', afterStatus: 'INACTIVE' },
  { key: 'APPROVE',        label: 'Approve',        action: 'EOD_APPROVED' },
  { key: 'REJECT',         label: 'Reject',         action: 'EOD_REJECTED' },
  { key: 'PASSWORD_RESET', label: 'Password Reset', action: 'PASSWORD_RESET' },
];

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
    const dateSuffix = date ? `, ${date}` : '';

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
    // Optional-chained to match entityType above — a null action would otherwise throw
    // here and, rendering inside the dashboard's activity list, blank the page.
    const verb = event.action?.toLowerCase() ?? 'change';
    return { message: `${actor} ${verb}d business rule${suffix}`, category: 'business-rule' };
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
  // Beyond a week, "Nd ago" stops being a useful sense of time — an absolute date reads better.
  if (d < 7)  return `${d}d ago`;
  return `on ${formatDateTime(iso)}`;
}

export function formatAuditDate(iso: string): string {
  return formatDateTime(iso);
}

export function auditActionBadgeStyle(action: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    CREATE:                { bg: 'rgba(47,182,124,.12)',  color: '#2FB67C' },
    UPDATE:                { bg: 'rgba(76,141,214,.12)',  color: '#4C8DD6' },
    STATUS_CHANGE:         { bg: 'rgba(224,169,59,.12)',  color: '#E0A93B' },
    PASSWORD_RESET:        { bg: 'rgba(233,30,99,.12)',   color: '#E91E63' },
    SOFT_DELETE:           { bg: 'rgba(228,55,61,.12)',   color: '#E4373D' },
    EOD_APPROVED:          { bg: 'rgba(232,144,36,.12)',  color: '#E89024' },
    EOD_REJECTED:          { bg: 'rgba(155,109,255,.12)', color: '#9B6DFF' },
    EOD_CHANGES_REQUESTED: { bg: 'rgba(224,169,59,.12)',  color: '#E0A93B' },
  };
  return map[action] ?? { bg: 'var(--raised2)', color: 'var(--txt-dim)' };
}

/** Action pill label + color, resolving STATUS_CHANGE's Activate/Deactivate split from the
 *  entry's own afterValue (same "status" field AuditLogSpecs.afterStatusIs queries on server).
 *  Colors follow the spec: green=Create/Activate, blue=Update, red=Delete, amber=Deactivate,
 *  purple=Reject, pink=Password Reset, amber/orange=Approve. */
export function auditActionDisplay(entry: AuditLogDto): { label: string; bg: string; color: string } {
  if (entry.action === 'STATUS_CHANGE') {
    const after = safeParse(entry.afterValue);
    const activated = after?.status === 'ACTIVE';
    return activated
      ? { label: 'Activate',   bg: 'rgba(47,182,124,.12)', color: '#2FB67C' }
      : { label: 'Deactivate', bg: 'rgba(224,169,59,.12)', color: '#E0A93B' };
  }
  const labels: Record<string, string> = {
    CREATE: 'Create', UPDATE: 'Update', SOFT_DELETE: 'Delete',
    PASSWORD_RESET: 'Password Reset', EOD_APPROVED: 'Approve', EOD_REJECTED: 'Reject',
    EOD_CHANGES_REQUESTED: 'Changes Requested',
  };
  const style = auditActionBadgeStyle(entry.action);
  return { label: labels[entry.action] ?? entry.action.replace(/_/g, ' '), ...style };
}
