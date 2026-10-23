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

/** An instant as a 12-hour clock in an explicit IANA zone ("2:30 AM"), never the browser's zone. Falls back to the
 *  server's own time-of-day string if the runtime rejects the zone id. */
function formatClockInZone(ms: number, timeZone: string, fallbackHhmm: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
      .formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
  } catch {
    return formatTime12h(fallbackHhmm);
  }
}

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
  // Absolute instants (with offset) when the server sends them: no zone assumption anywhere, so the countdown
  // is identical whatever zone the server or the browser runs in. The zone-less pair is only a fallback for an
  // older server that does not send them yet.
  const cutoffInstantMs = cutoff.cutoffAt ? Date.parse(cutoff.cutoffAt) : NaN;
  const nowInstantMs = cutoff.serverNowInstant ? Date.parse(cutoff.serverNowInstant) : NaN;
  const useInstants = !Number.isNaN(cutoffInstantMs) && !Number.isNaN(nowInstantMs);
  const cutoffMs = useInstants
    ? cutoffInstantMs
    : parseLocal(`${cutoff.today}T${cutoff.cutoffTime}`) + (cutoff.cutoffNextDay ? 24 * 60 * MINUTE : 0);
  if (Number.isNaN(cutoffMs)) return none;
  // The server's "now" is the anchor, plus only the time elapsed since the response (a duration). A response
  // without it (should not happen) falls back to the browser clock.
  const anchorMs = useInstants ? nowInstantMs : cutoff.serverNow ? parseLocal(cutoff.serverNow) : null;
  const serverNowMs = anchorMs === null ? nowMs : anchorMs + Math.max(0, nowMs - fetchedAt);
  const remainingMs = cutoffMs - serverNowMs;
  const closesAt = useInstants && cutoff.zone
    ? formatClockInZone(cutoffMs, cutoff.zone, cutoff.cutoffTime)
    : formatTime12h(cutoff.cutoffTime);
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
