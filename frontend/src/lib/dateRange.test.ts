import { describe, expect, it } from 'vitest';
import { clampRange, formatRangeLabel, resolvePreset, sameRange } from './dateRange';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('resolvePreset', () => {
  it('today is a single day', () => {
    expect(resolvePreset('today', d(2026, 10, 7))).toEqual({ from: '2026-10-07', to: '2026-10-07' });
  });

  it('this month starts on the 1st', () => {
    expect(resolvePreset('thisMonth', d(2026, 10, 7))).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });

  it('this month on the 1st is a single day', () => {
    expect(resolvePreset('thisMonth', d(2026, 10, 1))).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });

  it('this month at month end', () => {
    expect(resolvePreset('thisMonth', d(2026, 2, 28))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('last 7 days is inclusive of today (6 days back)', () => {
    expect(resolvePreset('last7', d(2026, 10, 7))).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });

  it('last 7 days crosses a month boundary', () => {
    expect(resolvePreset('last7', d(2026, 3, 3))).toEqual({ from: '2026-02-25', to: '2026-03-03' });
  });

  it('last 7 days crosses a year boundary', () => {
    expect(resolvePreset('last7', d(2026, 1, 3))).toEqual({ from: '2025-12-28', to: '2026-01-03' });
  });

  it('last 30 days is inclusive of today (29 days back)', () => {
    expect(resolvePreset('last30', d(2026, 10, 7))).toEqual({ from: '2026-09-08', to: '2026-10-07' });
  });

  it('last 30 days crosses a year boundary', () => {
    expect(resolvePreset('last30', d(2026, 1, 10))).toEqual({ from: '2025-12-12', to: '2026-01-10' });
  });

  it('uses local calendar days, not UTC (late-evening local time stays on the same day)', () => {
    expect(resolvePreset('today', new Date(2026, 9, 7, 23, 59))).toEqual({ from: '2026-10-07', to: '2026-10-07' });
  });
});

describe('clampRange', () => {
  it('leaves a valid range alone', () => {
    expect(clampRange({ from: '2026-10-01', to: '2026-10-07' }, 'from')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
  });

  it('From after To (From edited) pulls To up to From', () => {
    expect(clampRange({ from: '2026-10-09', to: '2026-10-07' }, 'from')).toEqual({ from: '2026-10-09', to: '2026-10-09' });
  });

  it('To before From (To edited) pulls From down to To', () => {
    expect(clampRange({ from: '2026-10-05', to: '2026-10-02' }, 'to')).toEqual({ from: '2026-10-02', to: '2026-10-02' });
  });

  it('caps both ends at max', () => {
    expect(clampRange({ from: '2026-10-20', to: '2026-10-25' }, 'to', '2026-10-07')).toEqual({ from: '2026-10-07', to: '2026-10-07' });
  });
});

describe('sameRange', () => {
  it('compares both ends', () => {
    expect(sameRange({ from: 'a', to: 'b' }, { from: 'a', to: 'b' })).toBe(true);
    expect(sameRange({ from: 'a', to: 'b' }, { from: 'a', to: 'c' })).toBe(false);
  });
});

describe('formatRangeLabel', () => {
  it('single day shows one date', () => {
    expect(formatRangeLabel({ from: '2026-10-07', to: '2026-10-07' })).toBe('07 Oct 2026');
  });

  it('same-year range shows the year on the end date only', () => {
    expect(formatRangeLabel({ from: '2026-10-01', to: '2026-10-07' })).toBe('01 Oct – 07 Oct 2026');
  });

  it('cross-year range shows both years', () => {
    expect(formatRangeLabel({ from: '2025-12-28', to: '2026-01-03' })).toBe('28 Dec 2025 – 03 Jan 2026');
  });
});

import {
  PRESET_LABELS, PRESET_ORDER, REPORT_PRESET_LABELS, REPORT_PRESET_ORDER,
  daysInRange, formatDayCount, resolveReportPreset,
} from './dateRange';

describe('resolveReportPreset — this week (Monday through today)', () => {
  it('on a Monday it is a single day', () => {
    // 2026-10-05 is a Monday
    expect(resolveReportPreset('thisWeek', d(2026, 10, 5))).toEqual({ from: '2026-10-05', to: '2026-10-05' });
  });

  it('mid-week starts on that week\'s Monday', () => {
    // 2026-10-07 is a Wednesday
    expect(resolveReportPreset('thisWeek', d(2026, 10, 7))).toEqual({ from: '2026-10-05', to: '2026-10-07' });
  });

  it('on a Sunday it spans the whole Monday-to-Sunday week (not the next week)', () => {
    // 2026-10-11 is a Sunday
    expect(resolveReportPreset('thisWeek', d(2026, 10, 11))).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('never runs into the future: To is always today', () => {
    for (let day = 5; day <= 11; day++) {
      expect(resolveReportPreset('thisWeek', d(2026, 10, day)).to).toBe(`2026-10-${String(day).padStart(2, '0')}`);
    }
  });

  it('crosses a month boundary when the week began last month', () => {
    // 2026-11-01 is a Sunday; its Monday is 2026-10-26
    expect(resolveReportPreset('thisWeek', d(2026, 11, 1))).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('crosses a year boundary', () => {
    // 2027-01-01 is a Friday; its Monday is 2026-12-28
    expect(resolveReportPreset('thisWeek', d(2027, 1, 1))).toEqual({ from: '2026-12-28', to: '2027-01-01' });
  });
});

describe('resolveReportPreset — last month', () => {
  it('is the full previous calendar month', () => {
    expect(resolveReportPreset('lastMonth', d(2026, 10, 9))).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('in January it is December of the previous year (year boundary)', () => {
    expect(resolveReportPreset('lastMonth', d(2027, 1, 15))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('handles a 31-day month after a shorter one and a leap February', () => {
    expect(resolveReportPreset('lastMonth', d(2026, 3, 10))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolveReportPreset('lastMonth', d(2028, 3, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(resolveReportPreset('lastMonth', d(2026, 12, 3))).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('is entirely in the past, so it never needs capping at today', () => {
    expect(resolveReportPreset('lastMonth', d(2026, 10, 1)).to < '2026-10-01').toBe(true);
  });
});

describe('resolveReportPreset — this month and custom', () => {
  it('this month matches the existing resolvePreset behaviour', () => {
    expect(resolveReportPreset('thisMonth', d(2026, 10, 9))).toEqual(resolvePreset('thisMonth', d(2026, 10, 9)));
    expect(resolveReportPreset('thisMonth', d(2026, 11, 1))).toEqual({ from: '2026-11-01', to: '2026-11-01' });
  });

  it('custom has no range of its own (today..today)', () => {
    expect(resolveReportPreset('custom', d(2026, 10, 9))).toEqual({ from: '2026-10-09', to: '2026-10-09' });
  });

  it('the report presets are Mon-week / month / last month / custom, in that order', () => {
    expect(REPORT_PRESET_ORDER).toEqual(['thisWeek', 'thisMonth', 'lastMonth', 'custom']);
    expect(REPORT_PRESET_LABELS).toEqual({
      thisWeek: 'This week', thisMonth: 'This month', lastMonth: 'Last month', custom: 'Custom',
    });
  });
});

describe('daysInRange — inclusive of both ends', () => {
  it('01-10 to 09-10 is 9 days', () => {
    expect(daysInRange({ from: '2026-10-01', to: '2026-10-09' })).toBe(9);
  });

  it('the same day is 1 day', () => {
    expect(daysInRange({ from: '2026-10-09', to: '2026-10-09' })).toBe(1);
  });

  it('spans month, year and leap-day boundaries correctly', () => {
    expect(daysInRange({ from: '2026-12-28', to: '2027-01-02' })).toBe(6);
    expect(daysInRange({ from: '2028-02-28', to: '2028-03-01' })).toBe(3);
    expect(daysInRange({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
  });

  it('is not skewed by a daylight-saving change', () => {
    expect(daysInRange({ from: '2026-03-28', to: '2026-03-30' })).toBe(3);
    expect(daysInRange({ from: '2026-10-24', to: '2026-10-26' })).toBe(3);
  });

  it('is 0 for a blank end or a backwards range', () => {
    expect(daysInRange({ from: '', to: '2026-10-09' })).toBe(0);
    expect(daysInRange({ from: '2026-10-01', to: '' })).toBe(0);
    expect(daysInRange({ from: '2026-10-09', to: '2026-10-01' })).toBe(0);
  });

  it('formats singular and plural', () => {
    expect(formatDayCount(1)).toBe('1 day');
    expect(formatDayCount(9)).toBe('9 days');
  });
});

describe('existing presets are untouched (other pages depend on them)', () => {
  it('RangePreset order and labels are exactly what DateRangeFilter renders today', () => {
    expect(PRESET_ORDER).toEqual(['today', 'last7', 'last30', 'thisMonth', 'custom']);
    expect(PRESET_LABELS).toEqual({
      today: 'Today', last7: 'Last 7 days', last30: 'Last 30 days', thisMonth: 'This month', custom: 'Custom',
    });
  });

  it('resolvePreset has no week or last-month case', () => {
    // An unknown preset still falls through to today..today, exactly as before.
    expect(resolvePreset('thisWeek' as never, d(2026, 10, 7))).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    expect(resolvePreset('lastMonth' as never, d(2026, 10, 7))).toEqual({ from: '2026-10-07', to: '2026-10-07' });
  });
});
