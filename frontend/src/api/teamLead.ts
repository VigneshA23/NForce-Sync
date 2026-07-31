import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  projectName: string | null;
  utilizationPct: number | null;
  underutilized: boolean;
  overloaded: boolean;
  hasOpenBlocker: boolean;
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

// ── hooks ───────────────────────────────────────────────────────────────────────

export function useTeamLeadSummary(date: string) {
  return useQuery({
    queryKey: ['team-lead', 'summary', date],
    queryFn: () =>
      api.get<TeamLeadSummaryDto>('/team-lead/dashboard/summary', { params: { date } }).then(r => r.data),
    refetchInterval: 60_000,
  });
}

export function useTeamMemberStatuses(date: string) {
  return useQuery({
    queryKey: ['team-lead', 'member-status', date],
    queryFn: () =>
      api.get<MemberEodStatusDto[]>('/team-lead/team-members/status', { params: { date } }).then(r => r.data),
  });
}

export function useTeamLeadBlockers(date: string) {
  return useQuery({
    queryKey: ['team-lead', 'blockers', date],
    queryFn: () =>
      api.get<TeamBlockerDto[]>('/team-lead/blockers', { params: { date } }).then(r => r.data),
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

export function useAcknowledgeBlocker(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) =>
      api.patch<TeamBlockerDto>(`/team-lead/blockers/${taskId}/acknowledge`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-lead', 'blockers', date] });
      qc.invalidateQueries({ queryKey: ['team-lead', 'member-status', date] });
      qc.invalidateQueries({ queryKey: ['team-lead', 'summary', date] });
    },
  });
}
