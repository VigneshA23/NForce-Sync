import { describe, expect, it } from 'vitest';
import type { UtilizationMember, UtilizationStatus, UtilizationSummary } from '../../../api/teamUtilization';
import {
  averageColor, countedMembers, deltaView, filterAndSort, fmtHours, fmtPct, headlineFor, periodCaption,
} from './utilizationLogic';

const THRESHOLDS = { underPct: 60, overPct: 100 };

function member(id: number, name: string, status: UtilizationStatus, pct: number | null, extra: Partial<UtilizationMember> = {}): UtilizationMember {
  return {
    id, fullName: name, employeeCode: `E-${id}`, email: null, status, utilizationPct: pct,
    hours: pct === null ? 0 : (pct / 100) * 8, avgHoursPerDay: pct === null ? null : (pct / 100) * 8,
    availableDays: pct === null ? 0 : 1, loggedDays: 0, hasPendingApproval: false, ...extra,
  };
}

function summary(over: Partial<UtilizationSummary> = {}): UtilizationSummary {
  return {
    period: 'day', noCompletedDays: false, weekFallback: false,
    from: '2026-10-07', to: '2026-10-07', previousFrom: '2026-10-06', previousTo: '2026-10-06',
    thresholds: THRESHOLDS, standardHoursPerDay: 8,
    averageUtilizationPct: 53.13, previousAverageUtilizationPct: 0, deltaPoints: 53.13,
    counts: { optimal: 1, under: 1, over: 1, none: 1 }, excludedCount: 1, totalMembers: 5, members: [],
    ...over,
  };
}

describe('periodCaption', () => {
  it('says "yesterday" for a Day that ended yesterday', () => {
    expect(periodCaption(summary(), '2026-10-07')).toBe('Showing yesterday, 7 Oct 2026');
  });

  it('names the weekday when the Day is not yesterday (e.g. a Monday showing Friday)', () => {
    const s = summary({ from: '2026-10-09', to: '2026-10-09' });
    expect(periodCaption(s, '2026-10-11')).toBe('Showing Fri, 9 Oct 2026');
  });

  it('shows "last week" for a fallback week (mocked Monday payload)', () => {
    const monday = summary({
      period: 'week', weekFallback: true, from: '2026-09-28', to: '2026-10-02',
      previousFrom: '2026-09-21', previousTo: '2026-09-27',
    });
    expect(periodCaption(monday, '2026-10-11')).toBe('Showing last week, 28 Sep – 2 Oct');
  });

  it('shows "this week so far" for an ordinary week and "month to date" for the month', () => {
    expect(periodCaption(summary({ period: 'week', from: '2026-10-05', to: '2026-10-07' }), 'x'))
      .toBe('Showing this week so far, 5 Oct – 7 Oct');
    expect(periodCaption(summary({ period: 'month', from: '2026-10-01', to: '2026-10-07' }), 'x'))
      .toBe('Showing this month to date, 1 Oct – 7 Oct');
  });

  it('collapses a one-day range and shows nothing when there are no completed days', () => {
    expect(periodCaption(summary({ period: 'week', from: '2026-10-01', to: '2026-10-01' }), 'x'))
      .toBe('Showing this week so far, 1 Oct');
    expect(periodCaption(summary({ noCompletedDays: true, from: null, to: null }), 'x')).toBeNull();
  });
});

describe('deltaView', () => {
  it('compares a Day against the previous working day by date', () => {
    expect(deltaView(summary())).toEqual({ tone: 'up', text: '▲ 53 pts vs 6 Oct' });
  });

  it('labels the comparison for week, fallback week and month', () => {
    expect(deltaView(summary({ period: 'week', deltaPoints: -4.2 })).text).toBe('▼ 4 pts vs previous week');
    expect(deltaView(summary({ period: 'week', weekFallback: true, deltaPoints: 2 })).text).toBe('▲ 2 pts vs the week before');
    expect(deltaView(summary({ period: 'month', deltaPoints: -10 })).text).toBe('▼ 10 pts vs previous month');
  });

  it('is flat when the rounded change is zero, and "no comparison" without a previous value', () => {
    expect(deltaView(summary({ deltaPoints: 0.3 })).tone).toBe('flat');
    expect(deltaView(summary({ deltaPoints: null }))).toEqual({ tone: 'none', text: 'No comparison available' });
  });
});

describe('headlineFor and counts', () => {
  it('counts only the four statuses that feed the average', () => {
    expect(countedMembers({ optimal: 1, under: 2, over: 3, none: 4 })).toBe(10);
  });

  it('follows the prototype rules in priority order', () => {
    expect(headlineFor({ optimal: 1, under: 0, over: 0, none: 3 }).headline).toBe("Most of the team hasn't logged hours yet");
    expect(headlineFor({ optimal: 3, under: 0, over: 3, none: 0 }).headline).toBe('3 people are stretched past capacity');
    expect(headlineFor({ optimal: 6, under: 2, over: 0, none: 0 }).headline).toBe('Most of the team is in a healthy range');
    expect(headlineFor({ optimal: 6, under: 2, over: 0, none: 0 }).sub).toBe('2 people have room for more work.');
    expect(headlineFor({ optimal: 2, under: 6, over: 0, none: 0 }).headline).toBe('Many people have room for more work');
    expect(headlineFor({ optimal: 0, under: 0, over: 0, none: 0 }).headline).toBe('Nobody was available in this period');
  });
});

describe('filterAndSort', () => {
  const members = [
    member(1, 'Ada Lovelace', 'optimal', 100),
    member(2, 'Bob Stone', 'under', 20),
    member(3, 'Cy Young', 'over', 120),
    member(4, 'Dee Park', 'none', 0),
    member(5, 'Eli Rain', 'unavailable', null),
  ];

  it('returns everyone with no filter or search, highest first, unavailable last', () => {
    expect(filterAndSort(members, null, '', 'high').map(m => m.id)).toEqual([3, 1, 2, 4, 5]);
  });

  it('sorts lowest first (still unavailable last) and by name', () => {
    expect(filterAndSort(members, null, '', 'low').map(m => m.id)).toEqual([4, 2, 1, 3, 5]);
    expect(filterAndSort(members, null, '', 'name').map(m => m.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('filters by status — a filtered count tile is exactly that status', () => {
    expect(filterAndSort(members, 'under', '', 'high').map(m => m.id)).toEqual([2]);
    expect(filterAndSort(members, 'none', '', 'high').map(m => m.id)).toEqual([4]);
    expect(filterAndSort(members, 'unavailable', '', 'high').map(m => m.id)).toEqual([5]);
  });

  it('searches by name or employee ID, case-insensitively, and combines with the filter', () => {
    expect(filterAndSort(members, null, 'stone', 'high').map(m => m.id)).toEqual([2]);
    expect(filterAndSort(members, null, 'e-3', 'high').map(m => m.id)).toEqual([3]);
    expect(filterAndSort(members, 'optimal', 'bob', 'high')).toEqual([]);
  });

  it('breaks percentage ties by name', () => {
    const tied = [member(1, 'Zed', 'under', 10), member(2, 'Amy', 'under', 10)];
    expect(filterAndSort(tied, null, '', 'high').map(m => m.fullName)).toEqual(['Amy', 'Zed']);
  });
});

describe('formatting and colour', () => {
  it('formats percentages and hours', () => {
    expect(fmtPct(53.13)).toBe('53%');
    expect(fmtPct(null)).toBe('—');
    expect(fmtHours(8)).toBe('8h');
    expect(fmtHours(2.67)).toBe('2.7h');
    expect(fmtHours(null)).toBe('—');
  });

  it('colours the average against the payload thresholds (not constants)', () => {
    expect(averageColor(59, THRESHOLDS)).toBe('var(--warn)');
    expect(averageColor(60, THRESHOLDS)).toBe('var(--ok)');
    expect(averageColor(101, THRESHOLDS)).toBe('var(--risk)');
    expect(averageColor(59, { underPct: 50, overPct: 100 })).toBe('var(--ok)');
    expect(averageColor(null, THRESHOLDS)).toBe('var(--txt-dim)');
  });
});
