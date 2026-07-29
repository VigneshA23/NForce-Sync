import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface MemberStatusDto {
  id: number;
  fullName: string;
  employeeCode: string;
  todayStatus: string;
}

export interface DashboardStatsDto {
  pendingApprovalsCount: number;
  teamUtilizationAvg: number | null;
  blockersCount: number;
  membersSubmittedToday: number;
  teamSize: number;
  members: MemberStatusDto[];
}

export interface BlockedTaskDto {
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
}

export function useDashboardStats(managerId: number | undefined) {
  return useQuery({
    queryKey: ['team', 'stats', managerId],
    queryFn: () =>
      api.get<DashboardStatsDto>(`/team/${managerId}/dashboard-stats`).then(r => r.data),
    enabled: managerId != null,
    refetchInterval: 60_000,
  });
}

export function useBlockers(managerId: number | undefined) {
  return useQuery({
    queryKey: ['team', 'blockers', managerId],
    queryFn: () =>
      api.get<BlockedTaskDto[]>('/eod/blocked', { params: { managerId } }).then(r => r.data),
    enabled: managerId != null,
  });
}
