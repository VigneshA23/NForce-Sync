import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface UtilSnapshotDto {
  id: number;
  employeeId: number;
  snapshotDate: string;
  availableHours: number;
  approvedProductiveHours: number;
  benchHours: number;
  idleHours: number;
  utilizationPct: number | null;
  computedAt: string;
}

export interface TeamUtilDto {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  snapshot: UtilSnapshotDto | null;
}

export interface OrgUtilRowDto {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string | null;
  snapshot: UtilSnapshotDto | null;
}

export function useTeamUtil(managerId: number | undefined, date: string) {
  return useQuery({
    queryKey: ['team', 'util', managerId, date],
    queryFn: () =>
      api.get<TeamUtilDto[]>(`/utilization/team/${managerId}`, { params: { date } })
        .then(r => r.data),
    enabled: managerId != null,
  });
}

export function useEmployeeUtil(employeeId: number, from: string, to: string) {
  return useQuery({
    queryKey: ['util', 'employee', employeeId, from, to],
    queryFn: () =>
      api.get<UtilSnapshotDto[]>(`/utilization/employee/${employeeId}`, { params: { from, to } })
        .then(r => r.data),
  });
}

export function useOrgUtil(date: string) {
  return useQuery({
    queryKey: ['util', 'org', date],
    queryFn: () =>
      api.get<OrgUtilRowDto[]>('/utilization/org', { params: { date } })
        .then(r => r.data),
  });
}
