import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// Team Utilization page (My Reporting Team). Own file and own hooks on purpose: the older
// useMyReportsSummary / useMyReportsMemberStatuses are shared with Overview and EOD Status and
// answer a different question (one day, EOD statuses). Nothing here polls.

export type UtilizationPeriod = 'day' | 'week' | 'month';

/** Classified server-side against the configured thresholds — the UI only displays it. */
export type UtilizationStatus = 'optimal' | 'under' | 'over' | 'none' | 'unavailable';

export interface UtilizationThresholds {
  underPct: number;
  overPct: number;
}

export interface UtilizationMember {
  id: number;
  fullName: string;
  employeeCode: string;
  email: string | null;
  status: UtilizationStatus;
  /** Null only for "unavailable" members. */
  utilizationPct: number | null;
  /** Approved productive hours over the period. */
  hours: number;
  /** hours ÷ available days — the "Avg / day" column. Null when unavailable. */
  avgHoursPerDay: number | null;
  availableDays: number;
  loggedDays: number;
  /** A submitted EOD is still awaiting approval. A hint only — never changes status. */
  hasPendingApproval: boolean;
}

export interface UtilizationCounts {
  optimal: number;
  under: number;
  over: number;
  none: number;
}

export interface UtilizationSummary {
  period: UtilizationPeriod;
  /** The month has no completed day to show yet; members and counts are empty. */
  noCompletedDays: boolean;
  /** Week tab only: showing the last completed week because the current one has no completed day. */
  weekFallback: boolean;
  from: string | null;
  to: string | null;
  previousFrom: string | null;
  previousTo: string | null;
  thresholds: UtilizationThresholds;
  standardHoursPerDay: number;
  averageUtilizationPct: number | null;
  previousAverageUtilizationPct: number | null;
  deltaPoints: number | null;
  counts: UtilizationCounts;
  /** Members with no available day in the period (leave / holiday) — not in the average or counts. */
  excludedCount: number;
  totalMembers: number;
  members: UtilizationMember[];
}

const STALE = 30_000;

/**
 * The query key carries the tab AND an as-of date. The backend resolves the actual from/to, so they
 * can't be part of a key that must exist before the request — but the as-of date does the job the
 * resolved dates would: a tab switch is a different key (so it refetches), and so is the next day,
 * so a page left open overnight never serves yesterday's "latest completed day".
 */
export function useTeamUtilizationSummary(period: UtilizationPeriod, asOf: string) {
  return useQuery({
    queryKey: ['my-reports', 'team-utilization', 'summary', period, asOf],
    queryFn: () =>
      api.get<UtilizationSummary>('/my-reports/utilization/summary', { params: { period } }).then(r => r.data),
    staleTime: STALE,
  });
}

// ── expanded row: per-day values and the entries behind one day ───────────────────────────

export interface UtilizationDay {
  date: string;
  weekend: boolean;
  holiday: boolean;
  future: boolean;
  today: boolean;
  /** Approved full-day leave. Leave days stay clickable and show a "Leave" badge. */
  leave: boolean;
  /** Weekend / holiday / future days are not selectable. */
  selectable: boolean;
  /** Null when the day isn't selectable; "unavailable" on a leave day. */
  status: UtilizationStatus | null;
  utilizationPct: number | null;
  hours: number;
  hasSubmittedEntry: boolean;
  hasPendingApproval: boolean;
}

export interface UtilizationDays {
  employeeId: number;
  from: string;
  to: string;
  thresholds: UtilizationThresholds;
  standardHoursPerDay: number;
  /** Mean of the per-day percentages over elapsed available days. */
  averageUtilizationPct: number | null;
  days: UtilizationDay[];
}

export interface UtilizationEntry {
  taskId: number;
  projectCode: string | null;
  projectName: string | null;
  category: string | null;
  description: string | null;
  hours: number;
  /** task_category.is_productive — what utilization counts. (There is no billable flag in the system.) */
  productive: boolean;
}

export interface UtilizationEntries {
  employeeId: number;
  fullName: string;
  employeeCode: string;
  date: string;
  weekend: boolean;
  holiday: boolean;
  leave: boolean;
  dayType: string | null;
  /** SUBMITTED / PARTIALLY_APPROVED / APPROVED. Null when nothing has been submitted — drafts never show. */
  entryStatus: string | null;
  status: UtilizationStatus | null;
  utilizationPct: number | null;
  approvedProductiveHours: number;
  totalHours: number;
  hasPendingApproval: boolean;
  thresholds: UtilizationThresholds;
  standardHoursPerDay: number;
  entries: UtilizationEntry[];
}

/**
 * Lazily loaded: `enabled` stays false until the row is open. The key carries the tab and the exact
 * requested dates, so a tab switch (which changes the window) is a different cache entry.
 */
export function useMemberUtilizationDays(
  employeeId: number, period: UtilizationPeriod, from: string, to: string, enabled: boolean,
) {
  return useQuery({
    queryKey: ['my-reports', 'team-utilization', 'days', employeeId, period, from, to],
    queryFn: () =>
      api.get<UtilizationDays>('/my-reports/utilization/days', { params: { employeeId, from, to } }).then(r => r.data),
    enabled,
    staleTime: STALE,
    // 400 / 403 are answers, not transient faults.
    retry: false,
  });
}

/** Cached per [employeeId, date]: revisiting a date (or reopening the row) never refetches within staleTime. */
export function useMemberUtilizationEntries(employeeId: number, date: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['my-reports', 'team-utilization', 'entries', employeeId, date],
    queryFn: () =>
      api.get<UtilizationEntries>('/my-reports/utilization/entries', { params: { employeeId, date } }).then(r => r.data),
    enabled: enabled && !!date,
    staleTime: STALE,
    retry: false,
  });
}
