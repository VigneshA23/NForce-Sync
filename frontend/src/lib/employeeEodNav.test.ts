import { describe, expect, it } from 'vitest';
import { blockersBadgeFor, inboxBadgeFor } from './inboxBadge';
import { getNavPaths, getNavSections, hasEmployeeEodItems, isNavGroup, navPathFor } from './nav';
import type { Role } from './types';
import type { ServerUserCapabilities } from '../api/auth';

const caps = (over: Partial<ServerUserCapabilities> = {}): ServerUserCapabilities => ({
  leadsProjectIds: [], leadsProjectNames: [], managesProjectIds: [], managesProjectNames: [],
  hasDirectReports: false, eodForm: 'PROJECT_GROUPED', submitsEod: true, ...over,
});

function items(role: Role, c: ServerUserCapabilities) {
  return getNavSections(role, c).flatMap(s => s.items.flatMap(e => (isNavGroup(e) ? e.children : [e])));
}

const MY_EOD = ['/eod/submit', '/blockers', '/employee/eod-inbox'];

describe('employee-side EOD items for anyone who submits EODs (gated on submitsEod, not on role)', () => {
  // Suhita: a non-EMPLOYEE account with a reporting manager. Also covers the Admin / Super Admin accounts
  // that have a manager — the only non-EMPLOYEE roles that submit (HR / Finance / Leadership are
  // designations on an EMPLOYEE or PM account, not roles).
  it.each<Role>(['pm', 'admin', 'superadmin'])('%s with a reporting manager gets My Blockers and EOD Inbox', (role) => {
    const paths = items(role, caps()).map(i => i.path);
    expect(paths).toEqual(expect.arrayContaining(MY_EOD));
    expect(paths).toContain('/eod/history');
  });

  it('they sit in the My EOD section, next to Submit EOD and My EOD History', () => {
    const section = getNavSections('pm', caps()).find(s => s.section === 'My EOD')!;
    expect(section.items.map(e => (isNavGroup(e) ? e.key : e.path))).toEqual(
      expect.arrayContaining(['/eod/submit', '/blockers', '/employee/eod-inbox', '/eod/history']));
  });

  it('the route guard (nav paths) allows both pages, so notification links with ?highlight= work', () => {
    const allowed = getNavPaths('pm', caps());
    expect(allowed).toContain('/blockers');
    expect(allowed).toContain('/employee/eod-inbox');
    // Shell compares location.pathname (no query string) after navPathFor.
    expect(allowed).toContain(navPathFor('/employee/eod-inbox'));
    expect(allowed).toContain(navPathFor('/blockers'));
  });

  it('/employee/blockers is an alias of My Blockers: allowed exactly when My Blockers is', () => {
    expect(navPathFor('/employee/blockers')).toBe('/blockers');
    expect(getNavPaths('pm', caps())).toContain(navPathFor('/employee/blockers'));
    expect(getNavPaths('pm', caps({ submitsEod: false, eodForm: null }))).not.toContain(navPathFor('/employee/blockers'));
  });

  it('an account that does not submit EODs (no reporting manager) gets none of it', () => {
    const c = caps({ submitsEod: false, eodForm: null });
    const paths = items('superadmin', c).map(i => i.path);
    for (const p of MY_EOD) expect(paths).not.toContain(p);
    expect(getNavPaths('superadmin', c)).not.toContain('/blockers');
  });

  it('a daily-log (no project) account still gets the items — the page shows an empty state', () => {
    const paths = items('pm', caps({ eodForm: 'PLAIN_LOG' })).map(i => i.path);
    expect(paths).toEqual(expect.arrayContaining(['/blockers', '/employee/eod-inbox']));
  });

  it('does not duplicate where My Work already provides them (a lead, any role)', () => {
    const c = caps({ leadsProjectIds: [1] });
    const paths = items('pm', c).map(i => i.path);
    expect(paths.filter(p => p === '/blockers')).toHaveLength(1);
    expect(paths.filter(p => p === '/employee/eod-inbox')).toHaveLength(1);
    expect(getNavSections('pm', c).some(s => s.section === 'My EOD')).toBe(false);
  });

  it('does not change the EMPLOYEE role, which already has them', () => {
    const paths = items('employee', caps()).map(i => i.path);
    expect(paths.filter(p => p === '/blockers')).toHaveLength(1);
    expect(paths.filter(p => p === '/employee/eod-inbox')).toHaveLength(1);
  });

  it('adds no My Dashboard / My Projects / My Utilization for these accounts', () => {
    const paths = items('pm', caps()).map(i => i.path);
    for (const p of ['/dashboard', '/my-projects', '/utilization']) expect(paths).not.toContain(p);
  });

  it('a lead + PM + RM user: no path appears twice across the sections', () => {
    const c = caps({ leadsProjectIds: [1], managesProjectIds: [2], hasDirectReports: true });
    const paths = items('employee', c).map(i => i.path);
    expect(paths.length).toBe(new Set(paths).size);
    expect(paths).toEqual(expect.arrayContaining(['/team/blockers', '/projects/blockers', '/my-reports/blockers']));
  });

  it('Naveen (Super Admin, top of the tree, RM of several): My Reporting Team, none of the employee items', () => {
    const c = caps({ hasDirectReports: true, submitsEod: false, eodForm: null });
    const paths = items('superadmin', c).map(i => i.path);
    expect(paths).toEqual(expect.arrayContaining([
      '/my-reports/overview', '/my-reports/eod-status', '/my-reports/utilization',
      '/my-reports/approvals', '/my-reports/blockers', '/my-reports/eod-inbox']));
    expect(paths).not.toContain('/blockers');
  });
});

describe('hasEmployeeEodItems — the one condition for the employee-side unread fetches', () => {
  it('is true for the EMPLOYEE role, a lead, or anyone who submits EODs', () => {
    expect(hasEmployeeEodItems('employee', caps({ submitsEod: false }))).toBe(true);
    expect(hasEmployeeEodItems('pm', caps({ leadsProjectIds: [1], submitsEod: false }))).toBe(true);
    expect(hasEmployeeEodItems('admin', caps())).toBe(true);
  });

  it('is false for an account that does not submit and has no My Work', () => {
    expect(hasEmployeeEodItems('superadmin', caps({ submitsEod: false, eodForm: null }))).toBe(false);
  });
});

describe('badges on the employee-side items are looked up by path', () => {
  it('My Blockers shows unread reviewer replies on the viewer\'s own blockers', () => {
    expect(blockersBadgeFor({ path: '/blockers' }, { lead: 1, pm: 2, own: 4 })).toBe(4);
  });

  it('is not confused with Team Blockers / PM Blockers, and has no opinion without an own count', () => {
    expect(blockersBadgeFor({ path: '/team/blockers' }, { lead: 1, pm: 2, own: 4 })).toBe(1);
    expect(blockersBadgeFor({ path: '/projects/blockers' }, { lead: 1, pm: 2, own: 4 })).toBe(2);
    expect(blockersBadgeFor({ path: '/blockers' }, { lead: 1, pm: 2 })).toBeUndefined();
  });

  it('EOD Inbox on the employee side keeps the own-thread count, the RM inbox its own', () => {
    const counts = { own: 3, team: 5, pm: 7, rm: 9 };
    expect(inboxBadgeFor({ path: '/employee/eod-inbox' }, counts)).toBe(3);
    expect(inboxBadgeFor({ path: '/my-reports/eod-inbox' }, counts)).toBe(9);
  });
});
