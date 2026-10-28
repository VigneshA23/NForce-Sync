import { describe, expect, it } from 'vitest';
import { adjustmentBanner, adjustmentDurationOptions, minutesLabel, validateAdjustmentInput, type AdjustmentInput } from './timeAdjustment';
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
  it('15-minute steps up to 2 hours, within the shift and what is left in the shared pool', () => {
    expect(validateAdjustmentInput({ ...ok, mins: 15, remaining: 15 })).toEqual([]);
    expect(validateAdjustmentInput({ ...ok, mins: 20 })[0]).toContain('multiple of 15 minutes');
    expect(validateAdjustmentInput({ ...ok, mins: 150, remaining: 200, budget: 200 })[0]).toContain('cannot be longer than 2 hours');
    expect(validateAdjustmentInput({ ...ok, mins: 60, shiftMins: 45 })[0]).toContain('cannot exceed the shift length');
    expect(validateAdjustmentInput({ ...ok, mins: 60, remaining: 30 })[0])
      .toContain('exceeds your monthly time adjustment budget - 30 minutes of 2 hours left this month.');
  });
  it('an unchanged off-step legacy value is not blocked, a changed one is', () => {
    expect(validateAdjustmentInput({ ...ok, mins: 20, unchangedFromSaved: true })).toEqual([]);
    expect(validateAdjustmentInput({ ...ok, mins: 20, unchangedFromSaved: false })[0]).toContain('multiple of 15');
  });
});

describe('adjustmentDurationOptions — the dropdown offers whatever is left, 15 minutes at a time', () => {
  it('2 hours remaining: 15 minutes to 2 hours', () => {
    expect(adjustmentDurationOptions(120, 540)).toEqual([15, 30, 45, 60, 75, 90, 105, 120]);
  });
  it('15 minutes remaining: just 15 minutes', () => {
    expect(adjustmentDurationOptions(15, 540)).toEqual([15]);
  });
  it('0 remaining: nothing to pick', () => {
    expect(adjustmentDurationOptions(0, 540)).toEqual([]);
  });
  it('capped by the 2-hour limit and by the shift length', () => {
    expect(adjustmentDurationOptions(600, 540)).toHaveLength(8);
    expect(adjustmentDurationOptions(120, 45)).toEqual([15, 30, 45]);
  });
  it('an off-step remainder rounds down to the last whole step', () => {
    expect(adjustmentDurationOptions(50, 540)).toEqual([15, 30, 45]);
  });
});

describe('wording', () => {
  it('banner says when to arrive, leave, or be away', () => {
    expect(adjustmentBanner(ctx, null, 0)).toBe('Select a time adjustment type to see the calculated impact.');
    expect(adjustmentBanner(ctx, 'LATE_ARRIVAL', 0)).toContain('how late you will arrive');
    expect(adjustmentBanner(ctx, 'EARLY_LEAVE', 0, 15)).toBe('Choose a duration (up to 15 minutes).');
    expect(adjustmentBanner(ctx, 'EARLY_LEAVE', 0)).toBe('Choose a duration (up to 2 hours).');
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
