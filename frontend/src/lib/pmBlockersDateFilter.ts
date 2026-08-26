import { todayISO as localTodayISO, toLocalISODate } from './date';
import type { DateRange } from '../api/teamLead';

/**
 * The PM Blockers page's date/range selection (Today / Yesterday / custom range) — same
 * URL + sessionStorage-fallback approach as the Team Lead Blockers page (see
 * lib/blockersDateFilter.ts), but under its own storage key so picking a date on one page
 * doesn't silently change what the other shows.
 */

export type DateMode = 'today' | 'yesterday' | 'range';

export const DATE_FILTER_STORAGE_KEY = 'nfsync_pm_blockers_date';

export interface StoredDateFilter {
  mode: DateMode;
  from?: string;
  to?: string;
}

export function readStoredDateFilter(): StoredDateFilter | null {
  try {
    const raw = sessionStorage.getItem(DATE_FILTER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredDateFilter) : null;
  } catch {
    return null;
  }
}

export function writeStoredDateFilter(filter: StoredDateFilter): void {
  try {
    sessionStorage.setItem(DATE_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {}
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

export interface ResolvedDateFilter {
  mode: DateMode;
  range: DateRange;
  isToday: boolean;
}

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Single source of truth for the range-descriptive subtitle shown wherever the PM Blockers
 * page needs to tell the user what date range it's looking at — the "Average Open Duration"
 * tile (both its "has data" and empty states) and the table's empty state (date-only case).
 * Today/Yesterday resolve to a real from===to date (see resolveBlockersDateFilter), so the
 * single-date case collapses "from X to X" into "on X" instead of repeating the date.
 */
export function getBlockerRangeSubtitle(mode: DateMode, from: string, to: string, hasBlockers: boolean): string {
  if (hasBlockers) {
    if (mode === 'today') return 'Across blockers today';
    if (mode === 'yesterday') return `Across blockers yesterday, ${fmtShortDate(from)}`;
    return from === to
      ? `Across blockers on ${fmtShortDate(from)}`
      : `Across blockers from ${fmtShortDate(from)} to ${fmtShortDate(to)}`;
  }
  if (mode === 'today') return `No blockers for today, ${fmtShortDate(from)}`;
  if (mode === 'yesterday') return `No blockers for yesterday, ${fmtShortDate(from)}`;
  return `No blockers from ${fmtShortDate(from)} to ${fmtShortDate(to)}`;
}

export function resolveBlockersDateFilter(searchParams: URLSearchParams): ResolvedDateFilter {
  const todayISO = localTodayISO();
  const stored = searchParams.get('mode') ? null : readStoredDateFilter();
  const modeParam = searchParams.get('mode') ?? stored?.mode ?? null;
  const fromParam = searchParams.get('from') ?? stored?.from ?? null;
  const toParam = searchParams.get('to') ?? stored?.to ?? null;
  const mode: DateMode = modeParam === 'yesterday'
    ? 'yesterday'
    : modeParam === 'range' && fromParam && toParam
      ? 'range'
      : 'today';

  const singleISO = mode === 'yesterday' ? yesterdayISO() : todayISO;
  const rangeFrom = mode === 'range' ? fromParam! : todayISO;
  const rangeTo = mode === 'range' ? toParam! : todayISO;

  const range: DateRange = mode === 'range' ? { from: rangeFrom, to: rangeTo } : { from: singleISO, to: singleISO };
  const isToday = mode !== 'range' && singleISO === todayISO;

  return { mode, range, isToday };
}
