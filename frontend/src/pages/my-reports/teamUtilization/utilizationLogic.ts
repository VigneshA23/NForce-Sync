import type {
  UtilizationCounts, UtilizationMember, UtilizationStatus, UtilizationSummary, UtilizationThresholds,
} from '../../../api/teamUtilization';

// Display-only helpers for the Team Utilization page. Classification itself (none / under / optimal /
// over / unavailable) happens on the server against the configured thresholds — nothing in here
// decides a status, and nothing imports lib/rules.ts. Thresholds only ever arrive in the payload.

export interface StatusMeta {
  label: string;
  /** Design token (never a hex value). */
  color: string;
}

export const STATUS_META: Record<UtilizationStatus, StatusMeta> = {
  optimal:     { label: 'Optimal',          color: 'var(--ok)' },
  under:       { label: 'Under-utilised',   color: 'var(--warn)' },
  over:        { label: 'Overloaded',       color: 'var(--risk)' },
  none:        { label: 'No hours logged',  color: 'var(--txt-dim)' },
  unavailable: { label: 'Unavailable',      color: 'var(--txt-dim)' },
};

/** The four statuses that count toward the average, in the order the legend shows them. */
export const COUNTED_STATUSES = ['optimal', 'under', 'over', 'none'] as const;
export type CountedStatus = (typeof COUNTED_STATUSES)[number];

export function countedMembers(c: UtilizationCounts): number {
  return c.optimal + c.under + c.over + c.none;
}

export function statusHint(status: CountedStatus, t: UtilizationThresholds): string {
  switch (status) {
    case 'optimal': return `${t.underPct}–${t.overPct}% of the day`;
    case 'under':   return `Below ${t.underPct}%`;
    case 'over':    return `Above ${t.overPct}%`;
    case 'none':    return 'No EOD submitted';
  }
}

// ── numbers ───────────────────────────────────────────────────────────────────────

export function fmtPct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

/** 8 → "8h", 2.67 → "2.7h". */
export function fmtHours(n: number | null): string {
  return n === null ? '—' : `${Number(n.toFixed(1))}h`;
}

/** Gauge / delta colour for the team average, against the payload's thresholds. */
export function averageColor(avg: number | null, t: UtilizationThresholds): string {
  if (avg === null) return 'var(--txt-dim)';
  if (avg < t.underPct) return 'var(--warn)';
  if (avg > t.overPct) return 'var(--risk)';
  return 'var(--ok)';
}

// ── dates ─────────────────────────────────────────────────────────────────────────

function local(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Fixed three-letter abbreviations rather than toLocaleDateString: the en-GB locale renders September
// as "Sept" in current ICU/Chrome, which would make labels differ by browser and break "28 Sep – 2 Oct".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDay(iso: string): string {
  const d = local(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDayShort(iso: string): string {
  const d = local(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtDayWithWeekday(iso: string): string {
  return `${WEEKDAYS[local(iso).getDay()]}, ${fmtDay(iso)}`;
}

export function fmtRange(from: string, to: string): string {
  return from === to ? fmtDayShort(from) : `${fmtDayShort(from)} – ${fmtDayShort(to)}`;
}

/**
 * The small read-only line under the subtitle. Null when there is nothing to show.
 * `yesterday` is passed in (not read from the clock) so this stays a pure function.
 */
export function periodCaption(s: UtilizationSummary, yesterday: string): string | null {
  if (s.noCompletedDays || !s.from || !s.to) return null;
  switch (s.period) {
    case 'day':
      return s.to === yesterday ? `Showing yesterday, ${fmtDay(s.to)}` : `Showing ${fmtDayWithWeekday(s.to)}`;
    case 'week':
      return s.weekFallback
        ? `Showing last week, ${fmtRange(s.from, s.to)}`
        : `Showing this week so far, ${fmtRange(s.from, s.to)}`;
    case 'month':
      return `Showing this month to date, ${fmtRange(s.from, s.to)}`;
  }
}

// ── delta chip ────────────────────────────────────────────────────────────────────

export type DeltaTone = 'up' | 'down' | 'flat' | 'none';

export function deltaView(s: UtilizationSummary): { tone: DeltaTone; text: string } {
  if (s.deltaPoints === null) return { tone: 'none', text: 'No comparison available' };
  const rounded = Math.round(Math.abs(s.deltaPoints));
  const tone: DeltaTone = rounded === 0 ? 'flat' : s.deltaPoints > 0 ? 'up' : 'down';
  const arrow = tone === 'up' ? '▲' : tone === 'down' ? '▼' : '●';
  let vs: string;
  if (s.period === 'day') vs = s.previousFrom ? `vs ${fmtDayShort(s.previousFrom)}` : 'vs previous working day';
  else if (s.period === 'week') vs = s.weekFallback ? 'vs the week before' : 'vs previous week';
  else vs = 'vs previous month';
  return { tone, text: `${arrow} ${rounded} pts ${vs}` };
}

// ── headline ──────────────────────────────────────────────────────────────────────

export function headlineFor(c: UtilizationCounts): { headline: string; sub: string } {
  const total = countedMembers(c);
  if (total === 0) {
    return { headline: 'Nobody was available in this period', sub: 'Everyone is on leave or it was a non-working period.' };
  }
  if (c.none / total >= 0.5) {
    return {
      headline: "Most of the team hasn't logged hours yet",
      sub: 'Utilization looks low because reports are missing, not because people are idle.',
    };
  }
  if (c.over >= 3 || c.over / total > 0.15) {
    return { headline: `${c.over} people are stretched past capacity`, sub: 'Check their allocations before more work lands on them.' };
  }
  if (c.optimal / total >= 0.5) {
    return {
      headline: 'Most of the team is in a healthy range',
      sub: c.under
        ? `${c.under} ${c.under === 1 ? 'person has' : 'people have'} room for more work.`
        : 'Workloads look well balanced.',
    };
  }
  return { headline: 'Many people have room for more work', sub: 'Consider reviewing unallocated time and open projects.' };
}

// ── members list ──────────────────────────────────────────────────────────────────

export type StatusFilter = UtilizationStatus | null;
export type SortKey = 'high' | 'low' | 'name';

/** Search by name or employee ID, filter by status, then sort. Unavailable (null %) members sort last. */
export function filterAndSort(
  members: UtilizationMember[], filter: StatusFilter, query: string, sort: SortKey,
): UtilizationMember[] {
  const needle = query.trim().toLowerCase();
  const rows = members.filter(m =>
    (!filter || m.status === filter)
    && (!needle || `${m.fullName} ${m.employeeCode}`.toLowerCase().includes(needle)));

  const byName = (a: UtilizationMember, b: UtilizationMember) => a.fullName.localeCompare(b.fullName);
  return [...rows].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (a.utilizationPct === null && b.utilizationPct === null) return byName(a, b);
    if (a.utilizationPct === null) return 1;
    if (b.utilizationPct === null) return -1;
    const diff = sort === 'high' ? b.utilizationPct - a.utilizationPct : a.utilizationPct - b.utilizationPct;
    return diff || byName(a, b);
  });
}

// ── expanded row: which days to fetch / show / select ──────────────────────────────

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First and last day of the month containing `anchor` (yyyy-MM-dd). Everything here stays inside it. */
export function monthBounds(anchor: string): { start: string; end: string } {
  const d = local(anchor);
  return { start: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

/** Monday–Sunday of the week containing `anchor`, clipped to the month. */
export function weekWindow(anchor: string, monthStart: string, monthEnd: string): { from: string; to: string } {
  const d = local(anchor);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const from = iso(monday);
  const to = iso(sunday);
  return { from: from < monthStart ? monthStart : from, to: to > monthEnd ? monthEnd : to };
}

/**
 * The dates to ask /days for, per tab — always inside the current month:
 *  Day   → the 1st … the Day's date (enough to find its last 5 working days)
 *  Week  → Mon–Sun of the summary's week (a fallback week too), clipped to the month
 *  Month → the whole month (future days come back flagged, so the heat-map can grey them out)
 */
export function daysWindowFor(s: UtilizationSummary, today: string): { from: string; to: string } | null {
  if (s.noCompletedDays || !s.to) return null;
  const { start, end } = monthBounds(today);
  switch (s.period) {
    case 'day': return { from: start, to: s.to };
    case 'week': return weekWindow(s.to, start, end);
    case 'month': return { from: start, to: end };
  }
}

/** Day tab: the last `n` working days up to and including the Day's own date. */
export function lastWorkingDays<T extends { date: string; selectable: boolean }>(days: T[], upTo: string, n = 5): T[] {
  return days.filter(d => d.selectable && d.date <= upTo).slice(-n);
}

/**
 * Where the entries box starts: the Day tab's own day; otherwise the latest working day inside the
 * period that has a submitted EOD, falling back to the period's last working day, then its end.
 */
export function defaultSelectedDate(
  s: UtilizationSummary, days: { date: string; selectable: boolean; hasSubmittedEntry: boolean }[],
): string | null {
  if (!s.to || !s.from) return null;
  if (s.period === 'day') return s.to;
  const inPeriod = days.filter(d => d.selectable && d.date >= s.from! && d.date <= s.to!);
  const withData = inPeriod.filter(d => d.hasSubmittedEntry);
  const pick = withData.length ? withData[withData.length - 1] : inPeriod[inPeriod.length - 1];
  return pick ? pick.date : s.to;
}

/** Blank cells before the 1st so the calendar starts on Monday. */
export function leadingBlanks(firstOfMonth: string): number {
  return (local(firstOfMonth).getDay() + 6) % 7;
}

export function weekdayShort(isoDate: string): string {
  return WEEKDAYS[local(isoDate).getDay()];
}

export function dayOfMonth(isoDate: string): number {
  return local(isoDate).getDate();
}

/** Spoken description of one day cell: the colour of a bar is never the only carrier of meaning. */
export function dayLabel(d: {
  date: string; weekend: boolean; holiday: boolean; future: boolean; leave: boolean;
  status: UtilizationStatus | null; utilizationPct: number | null;
}): string {
  const base = `${weekdayShort(d.date)} ${fmtDayShort(d.date)}`;
  if (d.weekend) return `${base}, weekend`;
  if (d.holiday) return `${base}, holiday`;
  if (d.future) return `${base}, not yet`;
  if (d.leave) return `${base}, leave`;
  return `${base}, ${fmtPct(d.utilizationPct)}${d.status ? `, ${STATUS_META[d.status].label}` : ''}`;
}
