import { useEffect, useState } from 'react';
import { formatHeroDate, formatHeroTime } from './date';

/**
 * A single "now" ticked once a minute (never every second — the hero banner shows time
 * without seconds, so a 1-minute cadence is all the UI can show and keeps re-renders cheap).
 * Aligns its first tick to the next minute boundary so the displayed clock never sits stale
 * for up to 59s after mount.
 */
function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return now;
}

function greetingWord(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 21) return 'Good Evening';
  return 'Good Night';
}

/** Time-of-day-aware greeting for the given name, e.g. "Good Morning, Priya Sharma! 👋". */
export function useGreeting(name: string): string {
  const now = useMinuteTick();
  return `${greetingWord(now.getHours())}, ${name}! \u{1F44B}`;
}

/** The hero banner's "Today" / "Current Time" mini-card values, both browser-local. */
export function useLiveClock(): { date: string; time: string } {
  const now = useMinuteTick();
  return { date: formatHeroDate(now), time: formatHeroTime(now) };
}
