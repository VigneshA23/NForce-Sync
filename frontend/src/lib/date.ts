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

/** Yesterday as `yyyy-MM-dd` in the browser's local timezone. */
export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

/**
 * Parses a calendar-date-only string (`yyyy-MM-dd`) as LOCAL midnight, not UTC —
 * `new Date('2026-07-30')` parses as UTC midnight, which renders as the previous
 * day in any timezone west of UTC (the same footgun `toLocalISODate` exists to
 * avoid, just on the read side). Full timestamps (with a `T` and/or zone offset)
 * and `Date` instances pass straight through to `new Date(...)`, since those
 * already carry real time/zone information worth respecting.
 */
function parseAsLocalDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(input);
}

/**
 * Display-layer only: renders a date as `DD-MM-YYYY`. Accepts a `yyyy-MM-dd`
 * calendar date, a full ISO timestamp, or a `Date`. Never use this to build a
 * value sent back to the API — the stored/wire format (`yyyy-MM-dd` or ISO
 * instant) is untouched; this only changes how it's read on screen.
 */
export function formatDate(input: string | Date): string {
  const d = parseAsLocalDate(input);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
}

/**
 * Display-layer only: renders a 24-hour `HH:mm` or `HH:mm:ss` string (the
 * shape the backend stores/sends for `LocalTime` fields — cutoff time, shift
 * start/end) as a 12-hour clock with AM/PM, e.g. `"19:00"` → `"7:00 PM"`. The
 * value sent to/from the API stays 24-hour — this never touches that string.
 */
export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h24 = Number(hStr);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mStr ?? '00'} ${period}`;
}

/**
 * Display-layer only: a minute count as a compact duration — `45 min`, `1 hr`, `1 hr 30 min`,
 * `2 hrs`. For badges and summary lines where the verbose form ("1 hour 30 minutes") is too long.
 */
export function formatDurationMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  const hLabel = h === 1 ? '1 hr' : `${h} hrs`;
  return rem === 0 ? hLabel : `${hLabel} ${rem} min`;
}

/** Display-layer only: `DD-MM-YYYY, h:mm AM/PM` for a full ISO timestamp. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)}, ${formatTime12h(`${hh}:${mm}`)}`;
}
