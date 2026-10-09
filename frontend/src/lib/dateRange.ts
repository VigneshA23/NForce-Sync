import { toLocalISODate } from './date';

/** Quick presets offered by the date-range filter. `custom` has no fixed range of its own. */
export type RangePreset = 'today' | 'last7' | 'last30' | 'thisMonth' | 'custom';

export interface DateRange {
  /** `yyyy-MM-dd`, local calendar date. */
  from: string;
  /** `yyyy-MM-dd`, local calendar date. */
  to: string;
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  thisMonth: 'This month',
  custom: 'Custom',
};

export const PRESET_ORDER: RangePreset[] = ['today', 'last7', 'last30', 'thisMonth', 'custom'];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `yyyy-MM-dd` → local-midnight Date (never via the UTC-parsing `new Date('yyyy-MM-dd')`). */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Range for a preset; the end date is always `today` (local). `custom` has no intrinsic range, so it
 * resolves to today..today and callers keep the user's own dates instead.
 */
export function resolvePreset(preset: RangePreset, today: Date = new Date()): DateRange {
  const to = toLocalISODate(today);
  switch (preset) {
    case 'last7':
      return { from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), to };
    case 'last30':
      return { from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to };
    case 'thisMonth':
      return { from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    case 'today':
    case 'custom':
    default:
      return { from: to, to };
  }
}

/**
 * Keeps a range valid after one end was edited: if From passes To, the *other* end follows the one
 * the user just changed (From edited → To = From; To edited → From = To). `max` caps both ends.
 */
export function clampRange(range: DateRange, edited: 'from' | 'to', max?: string): DateRange {
  let { from, to } = range;
  if (max) {
    if (from > max) from = max;
    if (to > max) to = max;
  }
  if (from > to) {
    if (edited === 'from') to = from;
    else from = to;
  }
  return { from, to };
}

export function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

function fmt(iso: string, withYear: boolean): string {
  const d = parseISO(iso);
  const base = `${String(d.getDate()).padStart(2, '0')} ${SHORT_MONTHS[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

/**
 * "07 Oct 2026" for a single day, "01 Oct – 07 Oct 2026" within one year (year on the end date only),
 * "28 Dec 2025 – 03 Jan 2026" when the range crosses a year.
 */
export function formatRangeLabel(range: DateRange): string {
  if (range.from === range.to) return fmt(range.to, true);
  const crossesYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  return `${fmt(range.from, crossesYear)} – ${fmt(range.to, true)}`;
}

// ── Report presets (additive) ──────────────────────────────────────────────────
// The Super Admin EOD Reports page offers a different preset set from DateRangeFilter. These are
// separate exports on purpose: extending RangePreset / PRESET_ORDER would add buttons to every page
// that renders DateRangeFilter.

export type ReportRangePreset = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

export const REPORT_PRESET_ORDER: ReportRangePreset[] = ['thisWeek', 'thisMonth', 'lastMonth', 'custom'];

export const REPORT_PRESET_LABELS: Record<ReportRangePreset, string> = {
  thisWeek: 'This week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  custom: 'Custom',
};

/**
 * Range for a report preset, local calendar days.
 * - thisWeek: Monday through today (never into the future; a Monday is a single day, a Sunday spans
 *   the whole Monday-to-Sunday week);
 * - thisMonth: the 1st through today (same as resolvePreset('thisMonth'));
 * - lastMonth: the 1st to the last day of the previous month (correct across a year boundary);
 * - custom: has no intrinsic range, so it resolves to today..today and callers keep the user's dates.
 */
export function resolveReportPreset(preset: ReportRangePreset, today: Date = new Date()): DateRange {
  const to = toLocalISODate(today);
  switch (preset) {
    case 'thisWeek': {
      const daysSinceMonday = (today.getDay() + 6) % 7; // Sunday(0) -> 6, Monday(1) -> 0
      return {
        from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday)),
        to,
      };
    }
    case 'thisMonth':
      return resolvePreset('thisMonth', today);
    case 'lastMonth':
      return {
        from: toLocalISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case 'custom':
    default:
      return { from: to, to };
  }
}

/** Number of calendar days in a range, counting both ends (01-10 to 09-10 is 9). 0 when either end
 *  is blank or the range is backwards. Uses UTC day numbers so a daylight-saving change can't skew it. */
export function daysInRange(range: DateRange): number {
  if (!range.from || !range.to) return 0;
  const [fy, fm, fd] = range.from.split('-').map(Number);
  const [ty, tm, td] = range.to.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
  return diff < 0 ? 0 : diff + 1;
}

/** "1 day" / "9 days". */
export function formatDayCount(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}
