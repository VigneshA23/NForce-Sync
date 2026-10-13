import { describe, expect, it } from 'vitest';
import { initialReportRange, showsCurrentMonthNote } from './reportDefaultRange';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('initialReportRange', () => {
  it('mid-month: first of the month through today', () => {
    expect(initialReportRange(d(2026, 10, 9))).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });

  it('on the 1st of a month: From = To = today', () => {
    expect(initialReportRange(d(2026, 11, 1))).toEqual({ from: '2026-11-01', to: '2026-11-01' });
  });

  it('on the last day of a month, and across a year boundary', () => {
    expect(initialReportRange(d(2026, 10, 31))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(initialReportRange(d(2027, 1, 1))).toEqual({ from: '2027-01-01', to: '2027-01-01' });
  });

  it('uses the local calendar day late in the evening (no UTC shift)', () => {
    expect(initialReportRange(new Date(2026, 9, 9, 23, 59))).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });
});

describe('showsCurrentMonthNote', () => {
  const today = d(2026, 10, 9);
  const defaults = { from: '2026-10-01', to: '2026-10-09' };

  it('shows while the dates are the untouched default', () => {
    expect(showsCurrentMonthNote(defaults, today)).toBe(true);
  });

  it('hides once either date has been changed', () => {
    expect(showsCurrentMonthNote({ from: '2026-09-01', to: '2026-10-09' }, today)).toBe(false);
    expect(showsCurrentMonthNote({ from: '2026-10-01', to: '2026-10-05' }, today)).toBe(false);
  });

  it('hides while a date is cleared', () => {
    expect(showsCurrentMonthNote({ from: '', to: '2026-10-09' }, today)).toBe(false);
    expect(showsCurrentMonthNote({ from: '', to: '' }, today)).toBe(false);
  });
});
