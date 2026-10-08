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
