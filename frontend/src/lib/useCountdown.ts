import { useEffect, useState } from 'react';

/**
 * Seconds remaining until `targetEpochMs`, re-rendering once a second and clamped at 0.
 *
 * Pass `null` to disable (returns 0 and starts no interval). The caller derives the target from a
 * server-supplied `retryAfterSeconds` — `Date.now() + retryAfterSeconds * 1000` — so the clock is
 * anchored to server truth rather than to a client-side guess about how long a lock lasts.
 */
export function useCountdown(targetEpochMs: number | null): number {
  const remainingFrom = (target: number) =>
    Math.max(0, Math.ceil((target - Date.now()) / 1000));

  const [remaining, setRemaining] = useState(() =>
    targetEpochMs == null ? 0 : remainingFrom(targetEpochMs),
  );

  useEffect(() => {
    if (targetEpochMs == null) {
      setRemaining(0);
      return;
    }

    // Set immediately so a re-mount doesn't show a stale value for up to a second.
    setRemaining(remainingFrom(targetEpochMs));

    const id = setInterval(() => {
      const next = remainingFrom(targetEpochMs);
      setRemaining(next);
      // Stop ticking once it hits zero — nothing left to count.
      if (next === 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [targetEpochMs]);

  return remaining;
}

/** Seconds as `mm:ss` (e.g. 872 → "14:32"). Hours are folded into the minutes column. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
