import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTimeAdjustmentContext } from '../../api/eod';
import {
  adjustmentBanner, validateAdjustmentInput,
} from './timeAdjustment';

/**
 * Form state and derived values for a time adjustment, shared by Submit EOD and the Daily Log. The shift timings
 * and the month's allowance usage come from the one endpoint (GET /eod/time-adjustment-context), keyed by date so
 * the month's counts follow the entry date rather than today.
 *
 * The adjustment exists only on a WORKING_DAY, and only when a shift is assigned (nothing to compute from
 * otherwise). `onChange` lets the host clear its own error banner when the user edits the adjustment.
 */
export function useTimeAdjustment({ date, dayType, enabled = true, onChange }: {
  date: string;
  dayType: string;
  enabled?: boolean;
  onChange?: () => void;
}) {
  const [adjEnabled,  setAdjEnabled]  = useState(false);
  const [adjType,     setAdjType]     = useState<string | null>(null);
  const [adjMinutes,  setAdjMinutes]  = useState<string>('');
  const [showBalance, setShowBalance] = useState(false);

  const { data: adjContext } = useQuery({
    queryKey: ['eod', 'time-adjustment-context', date],
    queryFn:  () => getTimeAdjustmentContext(date),
    enabled,
  });

  const isWorkingDay  = dayType === 'WORKING_DAY';
  const shiftAssigned = adjContext?.shiftAssigned === true;
  // Without a shift there are no timings to compute "reach office by" from, so the whole feature is
  // unavailable rather than half-working.
  const canRequestAdj = isWorkingDay && shiftAssigned;
  const adjMins       = parseInt(adjMinutes, 10) || 0;
  const adjActive     = canRequestAdj && adjEnabled && adjType != null && adjMins > 0;

  // One monthly pool of minutes shared across all three types, straight from the backend. It already
  // excludes drafts, rejected entries and this very day, so `remaining` is what this entry may still spend.
  const adjBudget    = adjContext?.monthlyAdjustmentMinutes ?? 0;
  const adjUsedMins  = adjContext?.adjustmentMinutesUsed ?? 0;
  const adjRemaining = Math.max(0, adjBudget - adjUsedMins);
  /** No headroom left at all — every type is unavailable, not just the one already used. */
  const adjExhausted = adjRemaining <= 0;
  const shiftMins    = adjContext?.shiftDurationMinutes ?? 0;

  function reset() {
    setAdjEnabled(false); setAdjType(null); setAdjMinutes(''); setShowBalance(false);
  }

  return {
    // state
    adjEnabled, adjType, adjMinutes, showBalance, setShowBalance, adjContext,
    // derived
    canRequestAdj, adjMins, adjActive, adjBudget, adjUsedMins, adjRemaining, adjExhausted, shiftMins,
    banner: () => adjustmentBanner(adjContext, adjType, adjMins),
    /** Errors for the current input; empty when no adjustment is asked for. */
    validate: () => validateAdjustmentInput({
      canRequest: canRequestAdj, enabled: adjEnabled, type: adjType, mins: adjMins,
      shiftMins, remaining: adjRemaining, budget: adjBudget,
    }),
    /** What to put on the save request: both null unless an adjustment is complete and allowed. */
    payload: () => ({
      timeAdjustmentType:    adjActive ? adjType : null,
      timeAdjustmentMinutes: adjActive ? adjMins : null,
    }),
    // handlers
    toggle(checked: boolean) {
      setAdjEnabled(checked);
      if (!checked) { setAdjType(null); setAdjMinutes(''); setShowBalance(false); }
      onChange?.();
    },
    changeType(next: string) {
      setAdjType(next);
      setAdjMinutes(''); // the two input styles don't share a scale, so never carry a value over
      onChange?.();
    },
    changeMinutes(v: string) { setAdjMinutes(v); onChange?.(); },
    /** Clear everything (no entry for the date, or a day type that cannot carry an adjustment). */
    reset,
    /** Copy a saved entry's adjustment into the form. */
    load(entry: { timeAdjustmentType: string | null; timeAdjustmentMinutes: number | null }) {
      setAdjEnabled(entry.timeAdjustmentType != null);
      setAdjType(entry.timeAdjustmentType ?? null);
      setAdjMinutes(entry.timeAdjustmentMinutes != null ? String(entry.timeAdjustmentMinutes) : '');
    },
  };
}

export type TimeAdjustmentState = ReturnType<typeof useTimeAdjustment>;
