import { todayISO as localTodayISO, toLocalISODate } from './date';
import type { DateRange } from '../api/teamLead';

/**
 * The Team Dashboard's date/range selection (Today / Yesterday / custom range), and the
 * resolution logic for it, live here rather than in TeamDashboard.tsx so that other
 * global chrome — specifically the sidebar's "Approvals" badge in Shell.tsx — can compute
 * the exact same DateRange from the exact same URL and derive a pending-approvals count
 * that's guaranteed to agree with the dashboard's own KPI card and "Review approvals" button.
 * Two independent re-implementations of this parsing would drift; this is the single source.
 */

export type DateMode = 'today' | 'yesterday' | 'range';

// Backs up the URL-held date selection so it also survives navigation that drops the query
// string entirely (e.g. clicking the "Team Dashboard" sidebar link, which points at the bare
// path) — the URL stays the source of truth whenever it has the params, this is only the
// fallback so a plain nav-away-and-back doesn't silently reset to "Today".
export const DATE_FILTER_STORAGE_KEY = 'nfsync_team_dashboard_date';

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

export function yesterdayISO(): string {
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
 * mirror only when the URL carries no `mode` param at all (matches TeamDashboard's own
 * mount-sync effect, which writes the fallback straight back into the URL). */
export function resolveTeamDashboardDateFilter(searchParams: URLSearchParams): ResolvedDateFilter {
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
