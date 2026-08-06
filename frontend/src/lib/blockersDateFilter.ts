import { todayISO as localTodayISO, toLocalISODate } from './date';
import type { DateRange } from '../api/teamLead';

/**
 * The Team Lead's Blockers page date/range selection (Today / Yesterday / custom range) —
 * same URL + sessionStorage-fallback approach as the Team Dashboard's date filter (see
 * lib/teamDashboardDateFilter.ts), but under its own storage key so picking a date here
 * doesn't silently change what the dashboard shows, and vice versa.
 */

export type DateMode = 'today' | 'yesterday' | 'range';

// Backs up the URL-held date selection so it also survives navigation that drops the query
// string entirely — the URL stays the source of truth whenever it has the params, this is
// only the fallback so a plain nav-away-and-back doesn't silently reset to "Today".
export const DATE_FILTER_STORAGE_KEY = 'nfsync_team_blockers_date';

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

/** Pure resolution of mode/range from a URLSearchParams — falls back to the sessionStorage
 * mirror only when the URL carries no `mode` param at all (matches the Blockers page's own
 * mount-sync effect, which writes the fallback straight back into the URL). */
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
