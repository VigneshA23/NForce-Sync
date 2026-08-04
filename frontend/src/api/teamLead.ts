import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';

// ── types (mirror backend DTOs in com.nforceone.sync.teamlead) ────────────────────

export type MemberEodStatus = 'SUBMITTED' | 'PENDING_APPROVAL' | 'MISSING' | 'ON_LEAVE';

export interface ThresholdsDto {
  underutilizedPct: number;
  overloadedPct: number;
  atRiskMissingPct: number;
  blockerAgeAlertHours: number;
}

export interface TrendPointDto {
  date: string;
  value: number | null;
}

export interface DashboardTrendDto {
  avgUtilization: TrendPointDto[];
  submittedCount: TrendPointDto[];
  pendingApprovalCount: TrendPointDto[];
  blockersCount: TrendPointDto[];
}

export interface TeamLeadSummaryDto {
  activeMembers: number;
  onLeaveCount: number;
  missingCount: number;
  pendingApprovalCount: number;
  submittedCount: number;
  avgUtilization: number | null;
  underutilizedCount: number;
  overloadedCount: number;
  activeBlockersCount: number;
  thresholds: ThresholdsDto;
}

export interface MemberEodStatusDto {
  id: number;
  fullName: string;
  employeeCode: string;
  status: MemberEodStatus;
  eodEntryId: number | null;
  projectNames: string[];
  utilizationPct: number | null;
  underutilized: boolean;
  overloaded: boolean;
  hasOpenBlocker: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface TeamBlockerDto {
  taskId: number;
  entryId: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  entryDate: string;
  projectCode: string | null;
  projectName: string | null;
  categoryName: string | null;
  description: string | null;
  hours: number | null;
  blockerReason: string | null;
  supportNeeded: string | null;
  submittedAt: string | null;
  openHours: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

/**
 * Warms today's dashboard queries right after login, in parallel with the lazy JS chunk
 * import — otherwise the first visit to Team Dashboard pays a full chunk-load-then-fetch
 * waterfall instead of the two overlapping.
 */
export function prefetchTeamLeadLanding(queryClient: QueryClient, today: string): void {
  const range: DateRange = { from: today, to: today };
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'summary', range.from, range.to],
    queryFn: () => api.get<TeamLeadSummaryDto>('/team-lead/dashboard/summary', { params: range }).then(r => r.data),
  });
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'member-status', range.from, range.to],
    queryFn: () => api.get<MemberEodStatusDto[]>('/team-lead/team-members/status', { params: range }).then(r => r.data),
  });
  queryClient.prefetchQuery({
    queryKey: ['team-lead', 'blockers', range.from, range.to],
    queryFn: () => api.get<TeamBlockerDto[]>('/team-lead/blockers', { params: range }).then(r => r.data),
  });
}

// ── hooks ───────────────────────────────────────────────────────────────────────

// `live` enables 60s polling — pass it only while the Team Lead is viewing "today";
// polling a historical date/range would silently overwrite the snapshot they asked to see.
// A historical date/range can't change once its day is over, so it's cached far longer than
// "today" — matches the staleTime convention already used by useTeamLeadTrend/useThresholds.
function rangeStaleTime(live: boolean): number {
  return live ? 30_000 : 5 * 60_000;
}

export function useTeamLeadSummary(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['team-lead', 'summary', range.from, range.to],
    queryFn: () =>
      api.get<TeamLeadSummaryDto>('/team-lead/dashboard/summary', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
    // Keep showing the previous range's data while a newly-picked range loads, instead of
    // unmounting the whole dashboard to a loading skeleton on every date/range change.
    placeholderData: keepPreviousData,
  });
}

export function useTeamMemberStatuses(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['team-lead', 'member-status', range.from, range.to],
    queryFn: () =>
      api.get<MemberEodStatusDto[]>('/team-lead/team-members/status', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
    placeholderData: keepPreviousData,
  });
}

export function useTeamLeadBlockers(range: DateRange, live = false) {
  return useQuery({
    queryKey: ['team-lead', 'blockers', range.from, range.to],
    queryFn: () =>
      api.get<TeamBlockerDto[]>('/team-lead/blockers', { params: range }).then(r => r.data),
    staleTime: rangeStaleTime(live),
    refetchInterval: live ? 60_000 : false,
    placeholderData: keepPreviousData,
  });
}

export function useTeamLeadTrend(date: string, days = 7) {
  return useQuery({
    queryKey: ['team-lead', 'trend', date, days],
    queryFn: () =>
      api.get<DashboardTrendDto>('/team-lead/dashboard/trend', { params: { date, days } }).then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useThresholds() {
  return useQuery({
    queryKey: ['team-lead', 'thresholds'],
    queryFn: () => api.get<ThresholdsDto>('/team-lead/thresholds').then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useAcknowledgeBlocker(range: DateRange) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) =>
      api.patch<TeamBlockerDto>(`/team-lead/blockers/${taskId}/acknowledge`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-lead', 'blockers', range.from, range.to] });
      qc.invalidateQueries({ queryKey: ['team-lead', 'member-status', range.from, range.to] });
      qc.invalidateQueries({ queryKey: ['team-lead', 'summary', range.from, range.to] });
    },
  });
}
