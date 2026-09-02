import { describe, it, expect } from 'vitest';
import { roundHours, totalHours } from './hoursBreakdown';

// Regression test for the Hours Breakdown "Total doesn't equal Billable + Non-Billable +
// Bench" bug: Total must always equal the sum of the same (rounded) category values shown
// in the UI, for every period filter, including fractional hours.
describe('totalHours', () => {
  const periods = [
    { label: '1M', billable: 41.25, nonBillable: 12.75, bench: 4 },
    { label: '3M', billable: 129, nonBillable: 47.5, bench: 13 }, // the reported 3M example
    { label: '6M', billable: 256.35, nonBillable: 88.05, bench: 22.6 },
  ];

  it.each(periods)('equals rounded Billable + Non-Billable + Bench for $label', ({ billable, nonBillable, bench }) => {
    const total = totalHours(billable, nonBillable, bench);
    const sumOfDisplayed = roundHours(billable) + roundHours(nonBillable) + roundHours(bench);
    expect(total).toBeCloseTo(sumOfDisplayed, 5);
    expect(total.toFixed(1)).toBe(sumOfDisplayed.toFixed(1));
  });

  it('reproduces the reported 3M bug value and confirms the fix', () => {
    // Previously the UI summed raw hours (189.5) but displayed the total at 0-decimal
    // precision, rendering "190h" next to categories that read 129.0h + 47.5h + 13.0h.
    const total = totalHours(129, 47.5, 13);
    expect(total).toBe(189.5);
    expect(total.toFixed(1)).toBe('189.5');
  });

  it('handles zero and whole-number inputs', () => {
    expect(totalHours(0, 0, 0)).toBe(0);
    expect(totalHours(10, 5, 5)).toBe(20);
  });
});
