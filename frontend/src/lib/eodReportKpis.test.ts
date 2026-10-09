import { describe, expect, it } from 'vitest';
import { averageHoursPerEmployee, formatAverageHours, formatKpiHours } from './eodReportKpis';

describe('averageHoursPerEmployee', () => {
  it('divides total hours by employees and rounds to one decimal', () => {
    expect(averageHoursPerEmployee(80, 10)).toBe(8);
    expect(averageHoursPerEmployee(75, 10)).toBe(7.5);
    expect(averageHoursPerEmployee(100, 3)).toBe(33.3);
    expect(averageHoursPerEmployee(20, 3)).toBe(6.7);
  });

  it('guards divide-by-zero: no employees gives 0, never NaN or Infinity', () => {
    expect(averageHoursPerEmployee(0, 0)).toBe(0);
    expect(averageHoursPerEmployee(120, 0)).toBe(0);
    expect(Number.isFinite(averageHoursPerEmployee(120, 0))).toBe(true);
  });

  it('treats a negative or non-finite count / total as 0', () => {
    expect(averageHoursPerEmployee(50, -2)).toBe(0);
    expect(averageHoursPerEmployee(Number.NaN, 5)).toBe(0);
    expect(averageHoursPerEmployee(Number.POSITIVE_INFINITY, 5)).toBe(0);
    expect(averageHoursPerEmployee(50, Number.NaN)).toBe(0);
  });

  it('zero hours across real employees is a genuine 0', () => {
    expect(averageHoursPerEmployee(0, 4)).toBe(0);
  });
});

describe('formatting', () => {
  it('hours: whole numbers stay whole, fractions get one decimal', () => {
    expect(formatKpiHours(120)).toBe('120');
    expect(formatKpiHours(7.5)).toBe('7.5');
    expect(formatKpiHours(7.25)).toBe('7.3');
  });

  it('average always shows one decimal', () => {
    expect(formatAverageHours(8)).toBe('8.0');
    expect(formatAverageHours(0)).toBe('0.0');
    expect(formatAverageHours(33.3)).toBe('33.3');
  });
});
