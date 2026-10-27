import { describe, expect, it } from 'vitest';
import { adjustmentBanner, minutesLabel, validateAdjustmentInput, type AdjustmentInput } from './timeAdjustment';
import type { TimeAdjustmentContextDto } from '../../api/eod';

const ctx: TimeAdjustmentContextDto = {
  shiftAssigned: true, shiftName: 'Evening Shift', shiftStart: '15:30:00', shiftEnd: '00:30:00',
  shiftDurationMinutes: 540, monthlyAdjustmentMinutes: 120, adjustmentMinutesUsed: 0,
};
const ok: AdjustmentInput = {
  canRequest: true, enabled: true, type: 'LATE_ARRIVAL', mins: 60, shiftMins: 540, remaining: 120, budget: 120,
};

describe('validateAdjustmentInput — the same rules Submit EOD and the Daily Log both use', () => {
  it('nothing to validate when the feature is not offered or not ticked', () => {
    expect(validateAdjustmentInput({ ...ok, canRequest: false, type: null })).toEqual([]);
    expect(validateAdjustmentInput({ ...ok, enabled: false, type: null })).toEqual([]);
  });
  it('a valid adjustment passes', () => {
    expect(validateAdjustmentInput(ok)).toEqual([]);
    expect(validateAdjustmentInput({ ...ok, mins: 120 })).toEqual([]);
  });
  it('needs a type, then a duration', () => {
    expect(validateAdjustmentInput({ ...ok, type: null })[0]).toContain('Select a time adjustment type');
    expect(validateAdjustmentInput({ ...ok, mins: 0 })[0]).toContain('Enter a valid duration');
  });
  it('30 minutes to 2 hours, within the shift and what is left in the shared pool', () => {
    expect(validateAdjustmentInput({ ...ok, mins: 15 })[0]).toContain('between 30 minutes and 2 hours');
    expect(validateAdjustmentInput({ ...ok, mins: 150, remaining: 200, budget: 200 })[0]).toContain('between 30 minutes and 2 hours');
    expect(validateAdjustmentInput({ ...ok, mins: 60, shiftMins: 45 })[0]).toContain('cannot exceed the shift length');
    expect(validateAdjustmentInput({ ...ok, mins: 60, remaining: 30 })[0])
      .toContain('exceeds your monthly time adjustment budget - 30 minutes of 2 hours left this month.');
  });
});

describe('wording', () => {
  it('banner says when to arrive, leave, or be away', () => {
    expect(adjustmentBanner(ctx, null, 0)).toBe('Select a time adjustment type to see the calculated impact.');
    expect(adjustmentBanner(ctx, 'LATE_ARRIVAL', 0)).toContain('how late you will arrive');
    expect(adjustmentBanner(ctx, 'INTERVENING', 45)).toBe('You will be away from office for 45 minutes during your shift.');
    expect(adjustmentBanner(ctx, 'LATE_ARRIVAL', 60)).toContain('reach office by');
    expect(adjustmentBanner(ctx, 'EARLY_LEAVE', 60)).toContain('leave office by');
  });
  it('minutesLabel', () => {
    expect(minutesLabel(45)).toBe('45 minutes');
    expect(minutesLabel(60)).toBe('1 hour');
    expect(minutesLabel(90)).toBe('1 hour 30 minutes');
    expect(minutesLabel(120)).toBe('2 hours');
  });
});
