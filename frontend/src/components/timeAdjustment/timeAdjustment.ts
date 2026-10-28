/**
 * Time adjustment (late arrival / intervening time-off / leaving early) — the pure rules and wording shared by
 * Submit EOD and the Daily Log. No React, no network: the form state lives in useTimeAdjustment, the markup in
 * TimeAdjustmentSection. Server-side counterpart: EodService.validateTimeAdjustment.
 */
import { formatTime12h } from '../../lib/date';
import type { TimeAdjustmentContextDto } from '../../api/eod';

/** Per-use duration rules for a time adjustment. Mirrored server-side in EodService. */
export const ADJ_STEP_MINUTES = 15;
export const MAX_ADJ_MINUTES = 120;

/**
 * Duration choices for ALL three adjustment types: 15-minute steps from one step up to the smallest of
 * the per-use cap, the shift length and what is left in the month's shared pool. The server still
 * re-checks every rule — the dropdown is a convenience, not the guarantee.
 */
export function adjustmentDurationOptions(remaining: number, shiftMins: number): number[] {
  const ceiling = Math.min(MAX_ADJ_MINUTES, shiftMins > 0 ? shiftMins : MAX_ADJ_MINUTES, Math.max(0, remaining));
  const out: number[] = [];
  for (let m = ADJ_STEP_MINUTES; m <= ceiling; m += ADJ_STEP_MINUTES) out.push(m);
  return out;
}

export const ADJ_TYPES = [
  { value: 'LATE_ARRIVAL', label: 'Late arrival',         durationLabel: 'Will come late by' },
  { value: 'INTERVENING',  label: 'Intervening time-off', durationLabel: 'Time away during shift' },
  { value: 'EARLY_LEAVE',  label: 'Leaving early',        durationLabel: 'Will leave early by' },
];

export function minutesLabel(m: number): string {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hLabel = h === 1 ? '1 hour' : `${h} hours`;
  return rem === 0 ? hLabel : `${hLabel} ${rem} minutes`;
}

/** 'HH:mm:ss' → minutes since midnight. */
export function timeToMinutes(hms: string): number {
  const [h, m] = hms.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight → 'HH:mm' for formatTime12h, wrapping past midnight. */
export function minutesToHm(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Live impact line. Exact wording matches the approved prototype. */
export function adjustmentBanner(
  ctx: TimeAdjustmentContextDto | undefined, type: string | null, mins: number, maxMins?: number,
): string {
  if (!type) return 'Select a time adjustment type to see the calculated impact.';
  if (mins <= 0) {
    const upTo = minutesLabel(maxMins ?? MAX_ADJ_MINUTES);
    return type === 'LATE_ARRIVAL'
      ? `Choose how late you will arrive (up to ${upTo}).`
      : `Choose a duration (up to ${upTo}).`;
  }
  const start = ctx?.shiftStart ? timeToMinutes(ctx.shiftStart) : 0;
  const end   = ctx?.shiftEnd   ? timeToMinutes(ctx.shiftEnd)   : 0;
  if (type === 'LATE_ARRIVAL') {
    return `You will have to reach office by ${formatTime12h(minutesToHm(start + mins))}`;
  }
  if (type === 'EARLY_LEAVE') {
    return `You can leave office by ${formatTime12h(minutesToHm(end - mins))}`;
  }
  return `You will be away from office for ${mins} minutes during your shift.`;
}

export interface AdjustmentInput {
  /** Working day with a shift assigned — otherwise the feature is not offered and nothing is validated. */
  canRequest: boolean;
  enabled: boolean;
  type: string | null;
  mins: number;
  shiftMins: number;
  remaining: number;
  budget: number;
  /** The entry being edited already carries this exact (possibly legacy, off-step) duration for this type. */
  unchangedFromSaved?: boolean;
}

/** Client-side mirror of EodService.validateTimeAdjustment. Empty = valid (or no adjustment asked for). */
export function validateAdjustmentInput(a: AdjustmentInput): string[] {
  if (!a.canRequest || !a.enabled) return [];
  if (!a.type) {
    return ['Select a time adjustment type (Late arrival, Intervening time-off, or Leaving early).'];
  }
  const label = ADJ_TYPES.find(t => t.value === a.type)?.label ?? 'Time adjustment';
  if (a.mins <= 0) return ['Enter a valid duration for this time adjustment.'];
  const errs: string[] = [];
  if (a.mins > MAX_ADJ_MINUTES) {
    errs.push(`${label} cannot be longer than 2 hours (got ${a.mins} minutes).`);
  }
  if (a.mins % ADJ_STEP_MINUTES !== 0 && !a.unchangedFromSaved) {
    errs.push(`${label} must be a multiple of ${ADJ_STEP_MINUTES} minutes (got ${a.mins} minutes).`);
  }
  if (a.shiftMins > 0 && a.mins > a.shiftMins) {
    errs.push(`Time adjustment minutes (${a.mins}) cannot exceed the shift length (${a.shiftMins} minutes).`);
  }
  // One shared pool, so the test is whether THIS duration still fits in what is left.
  if (a.mins > a.remaining) {
    errs.push(
      `${label} of ${minutesLabel(a.mins)} exceeds your monthly time adjustment budget - `
      + `${minutesLabel(a.remaining)} of ${minutesLabel(a.budget)} left this month.`,
    );
  }
  return errs;
}
