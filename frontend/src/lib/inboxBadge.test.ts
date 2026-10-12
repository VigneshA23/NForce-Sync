import { describe, expect, it } from 'vitest';
import { inboxBadgeFor } from './inboxBadge';
import { getNavPaths, getNavSections, isNavGroup } from './nav';
import type { ServerUserCapabilities } from '../api/auth';

const caps = (over: Partial<ServerUserCapabilities>): ServerUserCapabilities => ({
  leadsProjectIds: [], leadsProjectNames: [], managesProjectIds: [], managesProjectNames: [],
  hasDirectReports: false, eodForm: 'PROJECT_GROUPED', submitsEod: true, ...over,
});

function inboxItems(role: 'employee', c: ServerUserCapabilities) {
  return getNavSections(role, c).flatMap(s => s.items.flatMap(e => isNavGroup(e) ? e.children : [e]))
    .filter(i => i.path.endsWith('eod-inbox'));
}

describe('inboxBadgeFor', () => {
  const counts = { own: 3, team: 5, pm: 7 };

  it('shows the viewer\'s OWN thread count on My Work > EOD Inbox, even for a lead', () => {
    expect(inboxBadgeFor({ path: '/employee/eod-inbox' }, counts)).toBe(3);
  });

  it('keeps Team Inbox on the reviewer list, separate from the own-EOD count', () => {
    expect(inboxBadgeFor({ path: '/team/eod-inbox' }, counts)).toBe(5);
  });

  it('keeps the PM inbox on the PM list', () => {
    expect(inboxBadgeFor({ path: '/projects/eod-inbox' }, counts)).toBe(7);
  });

  it('has no opinion on any other item', () => {
    expect(inboxBadgeFor({ path: '/dashboard' }, counts)).toBeUndefined();
    expect(inboxBadgeFor({}, counts)).toBeUndefined();
  });
});

describe('inbox nav items by capability', () => {
  it('a project lead has both inboxes: his own (emp-eod-inbox) and Team Inbox — no RM duplicate', () => {
    const items = inboxItems('employee', caps({ leadsProjectIds: [1], hasDirectReports: true }));
    expect(items.map(i => i.key).sort()).toEqual(['emp-eod-inbox', 'eod-inbox']);
    expect(items.find(i => i.key === 'emp-eod-inbox')!.path).toBe('/employee/eod-inbox');
    expect(items.find(i => i.key === 'eod-inbox')!.path).toBe('/team/eod-inbox');
  });

  it('an RM who is not a lead gets one EOD Inbox under My Reporting Team, on /team/eod-inbox', () => {
    const c = caps({ hasDirectReports: true });
    const items = inboxItems('employee', c);
    expect(items.map(i => i.key)).toContain('rm-eod-inbox');
    // The route guard compares against nav paths, so this is what makes the notification link work.
    expect(getNavPaths('employee', c)).toContain('/team/eod-inbox');
  });

  it('a plain employee has no reviewer inbox and /team/eod-inbox is not permitted', () => {
    const c = caps({});
    expect(getNavPaths('employee', c)).not.toContain('/team/eod-inbox');
    expect(inboxItems('employee', c).map(i => i.path)).toEqual(['/employee/eod-inbox']);
  });
});

describe('reporting manager Blockers nav item', () => {
  const rmItems = (c: ServerUserCapabilities) => getNavSections('employee', c)
    .flatMap(sec => sec.items.flatMap(e => isNavGroup(e) ? e.children : [e]))
    .filter(i => i.key === 'rm-blockers');

  it('shows for an RM who is not a lead, on /my-reports/blockers', () => {
    const c = caps({ hasDirectReports: true });
    expect(rmItems(c).map(i => i.path)).toEqual(['/my-reports/blockers']);
    expect(getNavPaths('employee', c)).toContain('/my-reports/blockers');
  });

  it('also shows for an RM who is a lead, alongside Team Blockers — which is a different page', () => {
    const c = caps({ leadsProjectIds: [1], hasDirectReports: true });
    expect(rmItems(c)).toHaveLength(1);
    expect(getNavPaths('employee', c)).toEqual(expect.arrayContaining(['/my-reports/blockers', '/team/blockers']));
  });

  it('does not show for someone with no direct reports, and the path is not permitted', () => {
    const c = caps({ leadsProjectIds: [1] });
    expect(rmItems(c)).toHaveLength(0);
    expect(getNavPaths('employee', c)).not.toContain('/my-reports/blockers');
  });
});
