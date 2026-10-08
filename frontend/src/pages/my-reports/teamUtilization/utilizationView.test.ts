import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, parseUtilizationView, utilizationViewQuery } from './utilizationView';

describe('Team Utilization view state in the URL', () => {
  it('defaults to the Week tab, no filter, no search, highest first', () => {
    expect(parseUtilizationView(new URLSearchParams(''))).toEqual(DEFAULT_VIEW);
    expect(utilizationViewQuery(DEFAULT_VIEW)).toBe('');
  });

  it('round-trips tab, status filter, search and sort', () => {
    const view = { period: 'month' as const, filter: 'none' as const, q: 'sai g', sort: 'name' as const };
    expect(parseUtilizationView(new URLSearchParams(utilizationViewQuery(view)))).toEqual(view);
  });

  it('ignores an unknown tab, status or sort from a hand-edited URL', () => {
    const view = parseUtilizationView(new URLSearchParams('period=year&status=bogus&sort=sideways'));
    expect(view).toEqual(DEFAULT_VIEW);
  });

  it('only offers week and month — a stale ?period=day link falls back to the default', () => {
    expect(parseUtilizationView(new URLSearchParams('period=2026-09')).period).toBe('week');
    expect(parseUtilizationView(new URLSearchParams('period=day')).period).toBe('week');
  });
});
