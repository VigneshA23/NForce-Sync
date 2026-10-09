import { describe, expect, it } from 'vitest';
import { initialReportRange, showsCurrentMonthNote } from './reportDefaultRange';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('initialReportRange', () => {
  it('opted in, mid-month: first of the month through today', () => {
    expect(initialReportRange(true, d(2026, 10, 9))).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });

  it('opted in, on the 1st of a month: From = To = today', () => {
    expect(initialReportRange(true, d(2026, 11, 1))).toEqual({ from: '2026-11-01', to: '2026-11-01' });
  });

  it('opted in, last day of a month and a year boundary', () => {
    expect(initialReportRange(true, d(2026, 10, 31))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(initialReportRange(true, d(2027, 1, 1))).toEqual({ from: '2027-01-01', to: '2027-01-01' });
  });

  it('uses the local calendar day, not UTC (late evening stays on the same day)', () => {
    expect(initialReportRange(true, new Date(2026, 9, 9, 23, 59))).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });

  it('not opted in (the PM page): blank dates, exactly as before', () => {
    expect(initialReportRange(false, d(2026, 10, 9))).toEqual({ from: '', to: '' });
  });
});

describe('showsCurrentMonthNote', () => {
  const today = d(2026, 10, 9);
  const defaults = { from: '2026-10-01', to: '2026-10-09' };

  it('shows while the opted-in page still has the default range', () => {
    expect(showsCurrentMonthNote(true, defaults, today)).toBe(true);
  });

  it('hides once either date is changed', () => {
    expect(showsCurrentMonthNote(true, { from: '2026-09-01', to: '2026-10-09' }, today)).toBe(false);
    expect(showsCurrentMonthNote(true, { from: '2026-10-01', to: '2026-10-05' }, today)).toBe(false);
  });

  it('hides when a date is cleared (a cleared date is not silently re-defaulted)', () => {
    expect(showsCurrentMonthNote(true, { from: '', to: '2026-10-09' }, today)).toBe(false);
    expect(showsCurrentMonthNote(true, { from: '', to: '' }, today)).toBe(false);
  });

  it('never shows on a page that did not opt in', () => {
    expect(showsCurrentMonthNote(false, defaults, today)).toBe(false);
  });
});
