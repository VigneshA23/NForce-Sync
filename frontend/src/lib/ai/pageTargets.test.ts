import { describe, it, expect } from 'vitest';
import { ALL_ROLES, getNavPaths } from '../nav';
import { canNavigateTo, pageIdFor, resolvePageTarget } from './pageTargets';

// The registry's pageIds/roles, mirrored from backend/src/main/resources/ai-knowledge/pages/registry.yaml
// (kept honest by that file's own PageRegistryParityTest against nav.ts on the backend side).
const REACHABLE: Array<[string, (typeof ALL_ROLES)[number]]> = [
  ['dashboard', 'employee'],
  ['dashboard', 'lead'],
  ['dashboard', 'pm'],
  ['dashboard', 'admin'],
  ['dashboard', 'superadmin'],
  ['eod-submit', 'employee'],
  ['eod-submit', 'lead'],
  ['eod-history', 'employee'],
  ['eod-inbox', 'employee'],
  ['eod-inbox', 'lead'],
  ['eod-inbox', 'pm'],
  ['my-projects', 'employee'],
  ['my-projects', 'lead'],
  ['projects-allocation', 'pm'],
  ['utilization', 'employee'],
  ['utilization', 'lead'],
  ['utilization', 'pm'],
  ['blockers', 'employee'],
  ['blockers', 'lead'],
  ['blockers', 'pm'],
  ['approvals', 'lead'],
  ['approvals', 'pm'],
  ['reports', 'lead'],
  ['reports', 'pm'],
  ['user-management', 'admin'],
  ['org-masters', 'admin'],
  ['org-masters', 'superadmin'],
  ['business-rules', 'admin'],
  ['business-rules', 'superadmin'],
  ['roles-access', 'admin'],
  ['audit-log', 'admin'],
  ['reportee-pm-projects', 'superadmin'],
  ['reportee-pm-eod', 'superadmin'],
  ['reportee-pm-utilization', 'superadmin'],
  ['ai-assistant-admin', 'superadmin'], // M8: the real page, no longer a Placeholder
];

const PLACEHOLDER_OR_UNKNOWN: Array<[string, (typeof ALL_ROLES)[number]]> = [
  ['dashboard', 'dm'],
  ['dashboard', 'finance'],
  ['dashboard', 'leadership'],
  ['integrations', 'superadmin'],
  ['user-management', 'employee'],
  ['audit-log', 'lead'],
  ['not-a-real-page', 'employee'],
];

describe('resolvePageTarget', () => {
  it('resolves every reachable pageId+role pair to a route that is actually in that role\'s live nav', () => {
    for (const [pageId, role] of REACHABLE) {
      const target = resolvePageTarget(pageId, role);
      expect(target, `${pageId} for ${role} should resolve`).not.toBeNull();
      expect(getNavPaths(role).includes(target!.route) || isSharedRoute(target!.route)).toBe(true);
    }
  });

  it('never resolves a placeholder, unauthorized, or unknown pageId', () => {
    for (const [pageId, role] of PLACEHOLDER_OR_UNKNOWN) {
      expect(resolvePageTarget(pageId, role), `${pageId} for ${role} should NOT resolve`).toBeNull();
    }
  });

  it('resolves shared pages for every role', () => {
    for (const role of ALL_ROLES) {
      for (const pageId of ['notifications', 'profile', 'change-password', 'preferences']) {
        expect(resolvePageTarget(pageId, role), `${pageId} for ${role}`).not.toBeNull();
      }
    }
  });
});

describe('canNavigateTo', () => {
  it('mirrors resolvePageTarget', () => {
    expect(canNavigateTo('eod-submit', 'employee')).toBe(true);
    expect(canNavigateTo('dashboard', 'dm')).toBe(false);
  });
});

describe('pageIdFor', () => {
  it('reverse-resolves a known route to its pageId for that role', () => {
    expect(pageIdFor('employee', '/dashboard')).toBe('dashboard');
    expect(pageIdFor('pm', '/projects/dashboard')).toBe('dashboard');
    expect(pageIdFor('lead', '/team/utilization')).toBe('utilization');
  });

  it('returns null for a route not in the map', () => {
    expect(pageIdFor('employee', '/nonexistent')).toBeNull();
  });

  it('does not leak one role\'s route mapping onto another role\'s query', () => {
    // "/dashboard" is only the Employee's dashboard route — a PM asking about their own current
    // page must never be told it maps to "dashboard" from an Employee-built cache.
    expect(pageIdFor('pm', '/dashboard')).toBeNull();
    expect(pageIdFor('employee', '/dashboard')).toBe('dashboard');
  });
});

function isSharedRoute(route: string): boolean {
  return ['/notifications', '/profile', '/change-password', '/preferences'].includes(route);
}
