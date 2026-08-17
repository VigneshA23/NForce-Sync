// Strict DD-MM-YYYY date parsing/formatting shared by every manual date-entry field that must
// never trust a native <input type="date">'s silent normalization of an impossible date (e.g.
// 31 Feb) — see the original write-up in pages/employee/EodHistory.tsx. Validated purely by
// digit-count regex plus arithmetic range/leap-year checks, never by constructing a `Date` and
// reading back whatever it silently coerced to.

export const MIN_ISO_DATE = '1900-01-01';
export const MAX_ISO_DATE = '2099-12-31';
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2099;

const DDMMYYYY_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/**
 * Strictly parses a two-digit-day / two-digit-month / four-digit-year `DD-MM-YYYY` string
 * into its `YYYY-MM-DD` equivalent. Rejects single/triple-digit day or month, 2-digit or
 * 5+-digit years, out-of-range day/month, and impossible day-for-month combinations (Feb 30,
 * day 31 in a 30-day month, etc.). Returns `null` for anything that isn't a genuine calendar date.
 */
export function parseStrictDDMMYYYY(text: string): string | null {
  const m = DDMMYYYY_RE.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** `YYYY-MM-DD` → `DD-MM-YYYY`, for mirroring a calendar-picker selection into the text field. */
export function isoToDDMMYYYY(iso: string): string {
  const [y, mo, d] = iso.split('-');
  return `${d}-${mo}-${y}`;
}

/**
 * Restricts a date field's raw keystrokes to the DD-MM-YYYY structure itself, rather than
 * validating after the fact: strips every non-digit character, caps at 8 digits total (2+2+4),
 * and auto-inserts the `-` separators as digits accumulate. The result is always a
 * syntactically-valid prefix of DD-MM-YYYY — it just may not yet be a *complete* or
 * calendar-valid date, which is checked separately on blur/Enter by `parseStrictDDMMYYYY`.
 */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

// Both sides are always fixed-width, zero-padded `YYYY-MM-DD` by this point (never the
// DD-MM-YYYY display string, which sorts nothing like calendar order), so a plain string
// comparison is chronologically correct — no Date object, no timezone risk.
export function isRangeValid(from: string, to: string): boolean {
  if (from === '' || to === '') return true;
  return from <= to;
}

/** Today as a zero-padded `YYYY-MM-DD`, read from local date parts (never UTC/`toISOString`,
 * which can shift the calendar day depending on the browser's timezone offset). */
export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
