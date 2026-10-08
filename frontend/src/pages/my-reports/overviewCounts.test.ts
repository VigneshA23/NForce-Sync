import { describe, expect, it } from 'vitest';
import { overviewWording, rangeKind, summarizeMembers } from './overviewCounts';

const m = (status: 'SUBMITTED' | 'PENDING_APPROVAL' | 'MISSING' | 'ON_LEAVE', utilizationPct: number | null = null) =>
  ({ status, utilizationPct });

describe('summarizeMembers', () => {
  it('counts statuses, excludes leave from expected and counts pending as submitted', () => {
    const c = summarizeMembers([m('SUBMITTED', 80), m('PENDING_APPROVAL', 60), m('MISSING'), m('ON_LEAVE'), m('SUBMITTED', 100)]);
    expect(c).toMatchObject({ total: 5, submitted: 2, pending: 1, missing: 1, onLeave: 1, expected: 4, completionPct: 75 });
  });

  it('averages utilization over submitted/pending EODs only', () => {
    const c = summarizeMembers([m('SUBMITTED', 80), m('PENDING_APPROVAL', 60), m('MISSING', 10), m('ON_LEAVE', 99)]);
    expect(c.avgUtilization).toBe(70);
  });

  it('handles an empty team and an all-on-leave team without dividing by zero', () => {
    expect(summarizeMembers([])).toMatchObject({ expected: 0, completionPct: 0, avgUtilization: null });
    expect(summarizeMembers([m('ON_LEAVE')])).toMatchObject({ expected: 0, completionPct: 0 });
  });
});

describe('rangeKind', () => {
  it('distinguishes today, another single day and a multi-day range', () => {
    expect(rangeKind({ from: '2026-10-08', to: '2026-10-08' }, '2026-10-08')).toBe('today');
    expect(rangeKind({ from: '2026-10-07', to: '2026-10-07' }, '2026-10-08')).toBe('day');
    expect(rangeKind({ from: '2026-10-01', to: '2026-10-08' }, '2026-10-08')).toBe('range');
  });
});

describe('overviewWording', () => {
  const day = { from: '2026-10-08', to: '2026-10-08' };
  const span = { from: '2026-10-01', to: '2026-10-08' };

  it('uses "today" wording only for today', () => {
    const w = overviewWording('today', day, { missing: 2, expected: 9 });
    expect(w.headline).toBe('2 of 9 EODs still missing');
    expect(w.subtitle).toContain('today');
  });

  it('uses the date, not "today", for another single day', () => {
    const w = overviewWording('day', day, { missing: 2, expected: 9 });
    expect(w.headline).toBe('2 of 9 EODs missing');
    expect(w.subtitle).toContain('8 Oct 2026');
    expect(w.subtitle.toLowerCase()).not.toContain('today');
  });

  it('uses neutral wording for a multi-day range', () => {
    expect(overviewWording('range', span, { missing: 3, expected: 9 }).headline)
      .toBe('3 members have missing EODs in this period');
    expect(overviewWording('range', span, { missing: 1, expected: 9 }).headline)
      .toBe('1 member has missing EODs in this period');
    const w = overviewWording('range', span, { missing: 0, expected: 9 });
    expect(w.headline).toBe('No missing EODs in this period');
    expect(`${w.headline} ${w.subtitle}`.toLowerCase()).not.toContain('today');
  });

  it('says everyone submitted when nothing is missing', () => {
    expect(overviewWording('today', day, { missing: 0, expected: 9 }).headline).toBe('Everyone has submitted');
  });
});
