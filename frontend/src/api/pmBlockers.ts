import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { DateRange } from './teamLead';

// ── types (mirror backend DTOs in com.nforceone.sync.pmblockers) ──────────────────

export interface PmBlockerDto {
  taskId: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  teamName: string;
  projectCode: string | null;
  projectName: string | null;
  entryDate: string;
  categoryName: string | null;
  description: string | null;
  blockerReason: string | null;
  submittedAt: string | null;
  openHours: number;
  status: 'NEEDS_RESPONSE' | 'ACKNOWLEDGED' | 'RESOLVED';
  resolvedAt: string | null;
}

export interface ProjectOptionDto {
  id: number;
  name: string;
}

export interface TeamOptionDto {
  managerId: number;
  managerName: string;
}

export interface PmBlockersFiltersDto {
  projects: ProjectOptionDto[];
  teams: TeamOptionDto[];
}

export interface PmBlockersQuery extends DateRange {
  projectId?: number;
  teamManagerId?: number;
  status?: string;
}

export function usePmBlockers(query: PmBlockersQuery, enabled = true) {
  return useQuery({
    queryKey: ['pm-blockers', query.from, query.to, query.projectId, query.teamManagerId, query.status],
    queryFn: () => api.get<PmBlockerDto[]>('/pm-blockers', { params: query }).then(r => r.data),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function usePmBlockersFilters() {
  return useQuery({
    queryKey: ['pm-blockers', 'filters'],
    queryFn: () => api.get<PmBlockersFiltersDto>('/pm-blockers/filters').then(r => r.data),
    staleTime: 5 * 60_000,
  });
}
