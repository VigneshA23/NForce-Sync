import { describe, expect, it } from 'vitest';
import { ROLE_LANDING, resolveAllowedRoute } from './auth';
import { getNavPaths } from './nav';
import type { Role } from './types';
import type { ServerUserCapabilities } from '../api/auth';

const NO_CAPS: ServerUserCapabilities = {
  leadsProjectIds: [],
  leadsProjectNames: [],
  managesProjectIds: [],
  managesProjectNames: [],
  hasDirectReports: false,
  eodForm: null,
  submitsEod: false,
};

const MANAGES_PROJECT: ServerUserCapabilities = {
  ...NO_CAPS,
  managesProjectIds: [1],
  managesProjectNames: ['Project One'],
};

const ROLES = Object.keys(ROLE_LANDING) as Role[];

describe('ROLE_LANDING', () => {
  it.each(ROLES)('%s landing page is one that role can open', (role) => {
    expect(getNavPaths(role, NO_CAPS)).toContain(ROLE_LANDING[role]);
    expect(getNavPaths(role)).toContain(ROLE_LANDING[role]);
  });
});

describe('resolveAllowedRoute for the legacy /projects redirect', () => {
  it.each(ROLES.filter((r) => r !== 'pm'))(
    '%s without managed projects never lands on /projects/dashboard',
    (role) => {
      const target = resolveAllowedRoute(role, NO_CAPS, '/projects/dashboard');
      expect(target).not.toBe('/projects/dashboard');
      expect(target).toBe(ROLE_LANDING[role]);
    },
  );

  it('keeps /projects/dashboard for a PM', () => {
    expect(resolveAllowedRoute('pm', NO_CAPS, '/projects/dashboard')).toBe('/projects/dashboard');
  });

  it('keeps /projects/dashboard for a non-PM who manages projects', () => {
    expect(resolveAllowedRoute('admin', MANAGES_PROJECT, '/projects/dashboard')).toBe('/projects/dashboard');
  });
});
