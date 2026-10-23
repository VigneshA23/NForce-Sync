import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from './client';
import type { HolidayDto } from './businessRules';
import type { DateRange } from './teamLead';

export type { HolidayDto };

// ── Dashboard Summary ──────────────────────────────────────────────────────────

export interface CutoffStatus {
  today: string;
  entryStatus: string | null;
  cutoffPassed: boolean;
  /** Derived from the employee's shift (shift end + its cutoff hours). Null when they have no
   *  shift assigned, or their shift has no cutoff configured — then there is no deadline. */
  cutoffTime: string | null;
  /** Cutoff falls on the day after `today` — true for a shift crossing midnight. */
  cutoffNextDay: boolean;
  /** The server's clock (local date-time, same zone as cutoffTime) when this was computed. */
  serverNow?: string | null;
  /** The cutoff as an absolute instant (ISO-8601 with offset). Null when there is no deadline. Preferred over
   *  cutoffTime/serverNow, which are zone-less wall-clock values. */
  cutoffAt?: string | null;
  /** The server's clock as an absolute instant (ISO-8601 with offset) — the countdown anchor. */
  serverNowInstant?: string | null;
  /** IANA id of the business zone, e.g. "Asia/Kolkata". The "Closes 2:30 AM" label is formatted in it. */
  zone?: string | null;
}

export interface QuickStats {
  weekApprovedHours: number;
  monthAvgUtil: number | null;
  streak: number;
  daysSinceLastIssue: number;
}

export interface BlockedTask {
  taskId: number;
  entryId: number;
  entryDate: string;
  projectName: string;
  categoryName: string | null;
  description: string;
  blockerReason: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  status: 'NEEDS_RESPONSE' | 'ACKNOWLEDGED' | 'RESOLVED';
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface RecentEntry {
  id: number;
  date: string;
  status: string;
  totalHours: number;
  blockedTaskCount: number;
  utilizationPct: number | null;
}

export interface CalendarDay {
  date: string;
  status: string;
  utilizationPct: number | null;
  isWeekend: boolean;
  isFuture: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}

export interface DashboardSummary {
  cutoffStatus: CutoffStatus;
  quickStats: QuickStats;
  blockedTasks: BlockedTask[];
  recentEntries: RecentEntry[];
  calendarData: CalendarDay[];
}

// The dashboard's "My Blockers" list only covers the last 14 days (see
// EmployeeService.buildBlockedTasks) — a BLOCKER_REPLY notification can point at an older
// blocker that's fallen off that list. This fetches that one blocker directly by id so the
// notification's deep link always resolves to something, regardless of age.
//
// Polled on the same 30s/15s cadence as useUnreadNotificationsCount (api/notifications.ts) —
// a Team Lead's status change (e.g. marking a blocker Resolved) is made from their own
// separate session, so it can only reach this page via polling, not local cache invalidation.
export function useEmployeeBlocker(taskId: number | undefined) {
  return useQuery({
    queryKey: ['employee', 'blocker', taskId],
    queryFn: () => api.get<BlockedTask>(`/employee/blockers/${taskId}`).then(r => r.data),
    enabled: taskId != null,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

const MY_BLOCKERS_UNREAD_KEY = ['employee', 'blockers', 'unread-count'] as const;

/** Sidebar badge on My Blockers: how many of MY blockers have a reviewer reply I have not read yet — counted
 *  per blocker (not per message), cleared when I open that blocker's thread (useMarkMyBlockerRead). */
export function useMyBlockersUnreadCount(enabled = true): number {
  return useQuery({
    queryKey: MY_BLOCKERS_UNREAD_KEY,
    queryFn: () => api.get<number>('/employee/blockers/unread-count').then(r => r.data),
    enabled,
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  }).data ?? 0;
}

/** Opening a blocker's thread marks it read; the badge count drops at once instead of on the next poll. */
export function useMarkMyBlockerRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => api.post(`/employee/blockers/${taskId}/read`, {}),
    // No optimistic decrement: the count is per blocker across ALL my blockers, so a blind -1 could
    // under-count when this thread was already read. Refetch settles it within a round trip.
    onSettled: () => qc.invalidateQueries({ queryKey: MY_BLOCKERS_UNREAD_KEY }),
  });
}

// Full blocker history for the dedicated "My Blockers" page — polled unconditionally (not
// gated on the selected date range) so a Team Lead's status change always reaches this page
// without a manual refresh, same cadence as useEmployeeBlocker above.
export function useEmployeeBlockers(range?: DateRange) {
  const params: DateRange = range?.from
    ? range
    : { from: '2000-01-01', to: '2099-12-31' };
  return useQuery({
    queryKey: ['employee', 'blockers', params.from, params.to],
    queryFn: () => api.get<BlockedTask[]>('/employee/blockers', { params }).then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useDashboardSummary(calendarFrom?: string, calendarTo?: string) {
  return useQuery({
    queryKey: ['employee', 'dashboard-summary', calendarFrom ?? 'cur', calendarTo ?? 'cur'],
    queryFn: () => api.get<DashboardSummary>('/employee/dashboard-summary', {
      params: calendarFrom && calendarTo ? { calendarFrom, calendarTo } : undefined,
    }).then(r => r.data),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

// ── Utilization Detail ─────────────────────────────────────────────────────────

export interface WeekTrend {
  weekStart: string;
  weekEnd: string;
  avgUtilPct: number | null;
  totalApproved: number;
  totalAvailable: number;
  workingDays: number;
  approvedDays: number;
}

export interface CurrentPeriod {
  from: string;
  to: string;
  avgUtilPct: number | null;
  totalApproved: number;
  totalAvailable: number;
  workingDays: number;
  approvedDays: number;
}

export interface CategoryBreakdown {
  productiveHours: number;
  benchHours: number;
  totalApproved: number;
}

export interface HistoryDay {
  date: string;
  availableHours: number;
  approvedHours: number;
  benchHours: number;
  utilizationPct: number | null;
}

export interface UtilizationDetail {
  weeklyTrend: WeekTrend[];
  currentPeriod: CurrentPeriod;
  categoryBreakdown: CategoryBreakdown;
  history: HistoryDay[];
}

export function useUtilizationDetail(from: string, to: string) {
  return useQuery({
    queryKey: ['employee', 'utilization-detail', from, to],
    queryFn: () =>
      api.get<UtilizationDetail>('/employee/utilization-detail', { params: { from, to } })
        .then(r => r.data),
    staleTime: 60_000,
  });
}

// ── Dashboard stats (today status, pending corrections, missed dates) ─────────

export interface TodayStatusDto {
  status: string;
  submittedAt: string | null;
  remarks: string | null;
}

export interface PendingCorrectionDto {
  entryId: number;
  entryDate: string;
  status: string;
  reviewerComment: string | null;
  updatedAt: string;
}

export interface EmployeeDashboardStatsDto {
  todayStatus: TodayStatusDto;
  pendingCorrections: PendingCorrectionDto[];
  missedDates: string[];
  missedCount: number;
}

export function useEmployeeDashboardStats(employeeId: number | undefined) {
  return useQuery({
    queryKey: ['employee', 'dashboard-stats', employeeId],
    queryFn: () =>
      api.get<EmployeeDashboardStatsDto>(`/employee/${employeeId}/dashboard-stats`).then(r => r.data),
    enabled: employeeId != null,
    staleTime: 60_000,
  });
}

// ── Assigned projects ──────────────────────────────────────────────────────────

export interface EmployeeProjectDto {
  projectId: number;
  projectCode: string;
  projectName: string;
  leadName: string | null;
  projectStatus: string;
  assignedFrom: string;
  assignedTo: string | null;
}

export function useEmployeeProjects(employeeId: number | undefined) {
  return useQuery({
    queryKey: ['employee', 'projects', employeeId],
    queryFn: () =>
      api.get<EmployeeProjectDto[]>(`/employee/${employeeId}/projects`).then(r => r.data),
    enabled: employeeId != null,
    staleTime: 60_000,
  });
}

// ── Company holidays for a calendar year ────────────────────────────────────────

export function useHolidaysForYear(year: number) {
  return useQuery({
    queryKey: ['employee', 'holidays', year],
    queryFn: () => api.get<HolidayDto[]>('/employee/holidays', { params: { year } }).then(r => r.data),
    staleTime: 5 * 60_000,
  });
}
