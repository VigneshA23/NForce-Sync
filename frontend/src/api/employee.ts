import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from './client';
import type { HolidayDto } from './businessRules';
import type { DateRange } from './teamLead';

export type { HolidayDto };

// ── Dashboard Summary ──────────────────────────────────────────────────────────

export interface CutoffStatus {
  today: string;
  entryStatus: string | null;
  cutoffPassed: boolean;
  cutoffTime: string;
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
  description: string;
  blockerReason: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
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
export function useEmployeeBlocker(taskId: number | undefined) {
  return useQuery({
    queryKey: ['employee', 'blocker', taskId],
    queryFn: () => api.get<BlockedTask>(`/employee/blockers/${taskId}`).then(r => r.data),
    enabled: taskId != null,
  });
}

// Full blocker history for the dedicated "My Blockers" page — same 30s/5min live-vs-historical
// staleTime convention as useTeamLeadBlockers (api/teamLead.ts), since this mirrors that page.
function rangeStaleTime(live: boolean): number {
  return live ? 30_000 : 5 * 60_000;
}

export function useEmployeeBlockers(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['employee', 'blockers', range.from, range.to],
    queryFn: () => api.get<BlockedTask[]>('/employee/blockers', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
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
  billableHours: number;
  nonBillableHours: number;
  benchHours: number;
  totalApproved: number;
}

export interface HistoryDay {
  date: string;
  availableHours: number;
  approvedHours: number;
  billableHours: number;
  nonBillableHours: number;
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
  pmName: string | null;
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
