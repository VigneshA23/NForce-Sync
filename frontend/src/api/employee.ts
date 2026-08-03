import { useQuery } from '@tanstack/react-query';
import { api } from './client';

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
  entryId: number;
  entryDate: string;
  projectName: string;
  description: string;
  blockerReason: string | null;
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
