/**
 * Calendar-date helpers, deliberately local-time.
 *
 * `new Date().toISOString().slice(0, 10)` is the obvious way to get a `yyyy-MM-dd` string and the
 * wrong one: it returns the date in **UTC**. For a team in IST (+05:30) that means every night
 * between 00:00 and 05:30 local, "today" resolves to yesterday — an EOD submitted at 1am would
 * silently be filed against the previous day. Anywhere west of UTC has the mirror problem in the
 * evening.
 *
 * Use these for anything the user reads as a calendar day. For a point in time (a "last 24 hours"
 * cutoff, a timestamp sent to the server), a full `toISOString()` is still correct.
 */

/** A `Date` → `yyyy-MM-dd` in the browser's local timezone. */
export function toLocalISODate(d: Date): string {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today as `yyyy-MM-dd` in the browser's local timezone. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}
