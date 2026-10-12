import { useEffect, useState } from 'react';
import type { CutoffStatus } from '../../api/employee';
import { formatTime12h } from '../../lib/date';

// The submission-window countdown, split from dailyLogParts.tsx so that file exports only components.

export type WindowState =
  | { kind: 'none' }
  | { kind: 'open'; minutesLeft: number; urgent: boolean; closesAt: string; nextDay: boolean }
  | { kind: 'closed'; closesAt: string };

const MINUTE = 60_000;

/** A server-local date-time ("2026-10-12T19:30:05") or a date + time, read as a plain local value. Both
 *  operands of every subtraction below are parsed the same way, so the zone cancels out. */
const parseLocal = (s: string) => new Date(s).getTime();

/**
 * Time left to submit on time, counted from the SERVER's clock: the cutoff and `serverNow` both come from the
 * shift-based computation on the server, and only the time elapsed since that response (a duration, which
 * does not depend on the browser's clock being right) is added. Re-evaluated about once a minute — or at the
 * exact close — and the timer stops once the window is closed.
 *
 * @param fetchedAt when the response carrying `cutoff` arrived (the query's dataUpdatedAt)
 * @param active    false when the card does not apply (not today, nothing to show)
 */
/**
 * The window at instant `nowMs` (browser clock, used ONLY to measure time elapsed since `fetchedAt`): the cutoff
 * and `serverNow` both come from the server, so a wrong browser clock cannot move the result.
 */
export function computeSubmissionWindow(cutoff: CutoffStatus | undefined, fetchedAt: number, nowMs: number, active: boolean): { state: WindowState; remainingMs: number } {
  const none = { state: { kind: 'none' } as WindowState, remainingMs: 0 };
  if (!active || !cutoff?.cutoffTime) return none;
  const cutoffMs = parseLocal(`${cutoff.today}T${cutoff.cutoffTime}`) + (cutoff.cutoffNextDay ? 24 * 60 * MINUTE : 0);
  if (Number.isNaN(cutoffMs)) return none;
  // serverNow is the anchor. A response without it (should not happen) falls back to the browser clock.
  const serverNowMs = cutoff.serverNow ? parseLocal(cutoff.serverNow) + Math.max(0, nowMs - fetchedAt) : nowMs;
  const remainingMs = cutoffMs - serverNowMs;
  const closesAt = formatTime12h(cutoff.cutoffTime);
  if (cutoff.cutoffPassed || remainingMs <= 0) return { state: { kind: 'closed', closesAt }, remainingMs };
  const minutesLeft = Math.max(0, Math.floor(remainingMs / MINUTE));
  return { state: { kind: 'open', minutesLeft, urgent: minutesLeft < 60, closesAt, nextDay: cutoff.cutoffNextDay }, remainingMs };
}

/**
 * Time left to submit on time, counted from the SERVER's clock (see computeSubmissionWindow). Re-evaluated about
 * once a minute — or at the exact close — and the timer stops once the window is closed.
 *
 * @param fetchedAt when the response carrying `cutoff` arrived (the query's dataUpdatedAt)
 * @param active    false when the chip does not apply (not today)
 */
export function useSubmissionWindow(cutoff: CutoffStatus | undefined, fetchedAt: number, active: boolean): WindowState {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { state, remainingMs } = computeSubmissionWindow(cutoff, fetchedAt, nowMs, active);
  const ticking = state.kind === 'open';
  useEffect(() => {
    if (!ticking) return;                                   // closed (or n/a): no timer at all
    const wait = Math.min(MINUTE, Math.max(1_000, remainingMs + 250));
    const t = setTimeout(() => setNowMs(Date.now()), wait);
    return () => clearTimeout(t);
  }, [ticking, remainingMs, fetchedAt]);
  return state;
}
