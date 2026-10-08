import { describe, expect, it } from 'vitest';
import type { UtilizationSummary } from '../../../api/teamUtilization';
import {
  dayLabel, daysWindowFor, defaultSelectedDate, lastWorkingDays, leadingBlanks, monthBounds, weekWindow,
} from './utilizationLogic';

// October 2026: Thu 1, Fri 2, Sat 3, Sun 4, Mon 5 … Wed 7, Thu 8 … Sat 31.
function summary(over: Partial<UtilizationSummary>): UtilizationSummary {
  return {
    period: 'day', noCompletedDays: false, weekFallback: false,
    from: '2026-10-07', to: '2026-10-07', previousFrom: null, previousTo: null,
    thresholds: { underPct: 60, overPct: 100 }, standardHoursPerDay: 8,
    averageUtilizationPct: null, previousAverageUtilizationPct: null, deltaPoints: null,
    counts: { optimal: 0, under: 0, over: 0, none: 0 }, excludedCount: 0, totalMembers: 0, members: [],
    ...over,
  };
}

function day(date: string, extra: Partial<{ selectable: boolean; hasSubmittedEntry: boolean }> = {}) {
  return { date, selectable: true, hasSubmittedEntry: false, ...extra };
}

describe('month bounds and week windows stay inside the current month', () => {
  it('finds the first and last day of the month', () => {
    expect(monthBounds('2026-10-08')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthBounds('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('is Monday–Sunday for a mid-month week', () => {
    expect(weekWindow('2026-10-07', '2026-10-01', '2026-10-31')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('is clipped to the 1st when the week began last month', () => {
    // Fri Oct 2's week starts Mon Sep 28.
    expect(weekWindow('2026-10-02', '2026-10-01', '2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-04' });
  });

  it('is clipped to the last day when the week ends next month', () => {
    // Wed Oct 28's week ends Sun Nov 1.
    expect(weekWindow('2026-10-28', '2026-10-01', '2026-10-31')).toEqual({ from: '2026-10-26', to: '2026-10-31' });
  });
});

describe('daysWindowFor — what /days is asked for, per tab', () => {
  const TODAY = '2026-10-08';

  it('Day: the 1st up to the Day itself', () => {
    expect(daysWindowFor(summary({ period: 'day', to: '2026-10-07' }), TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });

  it('Week: Mon–Sun of the summary week, clipped to the month', () => {
    expect(daysWindowFor(summary({ period: 'week', from: '2026-10-05', to: '2026-10-07' }), TODAY))
      .toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('Week fallback (a Monday showing last week): that week, not the current one', () => {
    const fallback = summary({ period: 'week', weekFallback: true, from: '2026-10-05', to: '2026-10-09' });
    expect(daysWindowFor(fallback, '2026-10-12')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('Week fallback across a month boundary is clipped to the 1st', () => {
    const fallback = summary({ period: 'week', weekFallback: true, from: '2026-10-01', to: '2026-10-02' });
    expect(daysWindowFor(fallback, '2026-10-05')).toEqual({ from: '2026-10-01', to: '2026-10-04' });
  });

  it('Month: the whole month, so future days come back flagged', () => {
    expect(daysWindowFor(summary({ period: 'month', from: '2026-10-01', to: '2026-10-07' }), TODAY))
      .toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('asks for nothing when there are no completed days', () => {
    expect(daysWindowFor(summary({ noCompletedDays: true, from: null, to: null }), TODAY)).toBeNull();
  });

  it('never leaves the current month, for any tab', () => {
    for (const period of ['day', 'week', 'month'] as const) {
      const w = daysWindowFor(summary({ period, from: '2026-10-05', to: '2026-10-07' }), TODAY)!;
      expect(w.from >= '2026-10-01' && w.to <= '2026-10-31').toBe(true);
    }
  });
});

describe('lastWorkingDays — the Day tab bars', () => {
  const days = [
    day('2026-10-01'), day('2026-10-02', { selectable: false }),       // holiday
    day('2026-10-03', { selectable: false }), day('2026-10-04', { selectable: false }),   // weekend
    day('2026-10-05'), day('2026-10-06'), day('2026-10-07'), day('2026-10-08'),
  ];

  it('is the last five selectable days up to the Day, skipping weekends and holidays', () => {
    expect(lastWorkingDays(days, '2026-10-07').map(d => d.date))
      .toEqual(['2026-10-01', '2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('caps at five and never shows days after the Day (today is not completed)', () => {
    const many = ['01', '02', '05', '06', '07', '08', '09'].map(n => day(`2026-10-${n}`));
    expect(lastWorkingDays(many, '2026-10-08').map(d => d.date)).toEqual(['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    expect(lastWorkingDays(days, '2026-10-07').some(d => d.date === '2026-10-08')).toBe(false);
  });

  it('on the 2nd shows only what the month has (clipped, never reaching into September)', () => {
    expect(lastWorkingDays([day('2026-10-01'), day('2026-10-02')], '2026-10-02').map(d => d.date))
      .toEqual(['2026-10-01', '2026-10-02']);
  });
});

describe('defaultSelectedDate', () => {
  const days = [
    day('2026-10-05', { hasSubmittedEntry: true }),
    day('2026-10-06', { hasSubmittedEntry: true }),
    day('2026-10-07'),                                  // latest working day, but no data
    day('2026-10-10', { selectable: false }),
  ];

  it('is the Day tab\'s own date, whatever the data', () => {
    expect(defaultSelectedDate(summary({ period: 'day', to: '2026-10-07' }), days)).toBe('2026-10-07');
  });

  it('Week / Month: the latest working day in the period that has a submitted EOD', () => {
    expect(defaultSelectedDate(summary({ period: 'week', from: '2026-10-05', to: '2026-10-07' }), days)).toBe('2026-10-06');
    expect(defaultSelectedDate(summary({ period: 'month', from: '2026-10-01', to: '2026-10-07' }), days)).toBe('2026-10-06');
  });

  it('falls back to the latest working day when nothing in the period has data', () => {
    const empty = days.map(d => ({ ...d, hasSubmittedEntry: false }));
    expect(defaultSelectedDate(summary({ period: 'week', from: '2026-10-05', to: '2026-10-07' }), empty)).toBe('2026-10-07');
  });

  it('ignores days outside the period', () => {
    const outside = [day('2026-10-01', { hasSubmittedEntry: true }), day('2026-10-06')];
    expect(defaultSelectedDate(summary({ period: 'week', from: '2026-10-05', to: '2026-10-07' }), outside)).toBe('2026-10-06');
  });

  it('is null when the period has no dates', () => {
    expect(defaultSelectedDate(summary({ from: null, to: null }), days)).toBeNull();
  });
});

describe('calendar layout and labels', () => {
  it('starts the month on the right Monday-first column', () => {
    expect(leadingBlanks('2026-10-01')).toBe(3);   // Thursday
    expect(leadingBlanks('2026-11-01')).toBe(6);   // Sunday
    expect(leadingBlanks('2026-06-01')).toBe(0);   // Monday
  });

  it('describes each kind of day in words, not just colour', () => {
    const base = { weekend: false, holiday: false, future: false, leave: false, status: null, utilizationPct: null };
    expect(dayLabel({ ...base, date: '2026-10-03', weekend: true })).toBe('Sat 3 Oct, weekend');
    expect(dayLabel({ ...base, date: '2026-10-02', holiday: true })).toBe('Fri 2 Oct, holiday');
    expect(dayLabel({ ...base, date: '2026-10-15', future: true })).toBe('Thu 15 Oct, not yet');
    expect(dayLabel({ ...base, date: '2026-10-07', leave: true })).toBe('Wed 7 Oct, leave');
    expect(dayLabel({ ...base, date: '2026-10-07', status: 'optimal', utilizationPct: 100 })).toBe('Wed 7 Oct, 100%, Optimal');
  });
});
