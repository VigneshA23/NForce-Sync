import { describe, expect, it } from 'vitest';
import { getNavItem, getNavPaths, getNavSections, isNavGroup, navPathFor } from './nav';
import type { Role } from './types';
import type { ServerUserCapabilities } from '../api/auth';

const caps = (over: Partial<ServerUserCapabilities> = {}): ServerUserCapabilities => ({
  leadsProjectIds: [], leadsProjectNames: [], managesProjectIds: [], managesProjectNames: [],
  hasDirectReports: false, eodForm: 'PROJECT_GROUPED', submitsEod: true, ...over,
});

function submitItems(role: Role, c: ServerUserCapabilities) {
  return getNavSections(role, c)
    .flatMap(s => s.items.flatMap(e => (isNavGroup(e) ? e.children : [e])))
    .filter(i => i.path === '/eod/submit');
}

describe('Daily Log sidebar label for an employee on the bench (eodForm PLAIN_LOG)', () => {
  it('a new employee with no project sees "Daily Log", on the same /eod/submit route', () => {
    const items = submitItems('employee', caps({ eodForm: 'PLAIN_LOG' }));
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Daily Log');
    expect(items[0].path).toBe('/eod/submit');
  });

  it('an allocated employee keeps "Submit EOD"', () => {
    expect(submitItems('employee', caps({ eodForm: 'PROJECT_GROUPED' })).map(i => i.label)).toEqual(['Submit EOD']);
  });

  it('the breadcrumb label (getNavItem) follows the sidebar label, and the route is still allowed', () => {
    const c = caps({ eodForm: 'PLAIN_LOG' });
    expect(getNavItem('employee', navPathFor('/eod/submit'), c)?.item.label).toBe('Daily Log');
    expect(getNavPaths('employee', c)).toContain('/eod/submit');
    const allocated = caps({ eodForm: 'PROJECT_GROUPED' });
    expect(getNavItem('employee', '/eod/submit', allocated)?.item.label).toBe('Submit EOD');
  });

  it('an employee who also leads a project (My Work section) gets the same relabel when on PLAIN_LOG', () => {
    const items = submitItems('employee', caps({ eodForm: 'PLAIN_LOG', leadsProjectIds: [3], leadsProjectNames: ['X'] }));
    expect(items.map(i => i.label)).toEqual(['Daily Log']);
  });

  it.each<Role>(['pm', 'admin', 'superadmin'])('%s is unchanged — still "Submit EOD" even on PLAIN_LOG', (role) => {
    expect(submitItems(role, caps({ eodForm: 'PLAIN_LOG' })).map(i => i.label)).toEqual(['Submit EOD']);
    expect(submitItems(role, caps({ eodForm: 'PROJECT_GROUPED' })).map(i => i.label)).toEqual(['Submit EOD']);
  });

  it('only the /eod/submit item is renamed; the rest of the employee sidebar is untouched', () => {
    const labels = (c: ServerUserCapabilities) => getNavSections('employee', c)
      .flatMap(s => s.items.flatMap(e => (isNavGroup(e) ? e.children : [e]))).map(i => `${i.path}:${i.label}`);
    const bench = labels(caps({ eodForm: 'PLAIN_LOG' }));
    const project = labels(caps({ eodForm: 'PROJECT_GROUPED' }));
    expect(bench.filter(l => !l.startsWith('/eod/submit'))).toEqual(project.filter(l => !l.startsWith('/eod/submit')));
  });
});
