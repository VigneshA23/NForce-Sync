import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// ── types (mirror backend DTOs in com.nforceone.sync.plannedactual) ──────────────

export interface PlannedVsActualCardsDto {
  plannedHours: number;
  actualHours: number;
  plannedUtilizationPct: number;
  actualUtilizationPct: number;
  varianceHours: number;
  variancePct: number;
  projectCount: number;
  resourceCount: number;
}

export interface PlannedVsActualProjectRowDto {
  projectId: number;
  projectName: string;
  plannedHours: number;
  actualHours: number;
  plannedUtilizationPct: number;
  actualUtilizationPct: number;
  varianceHours: number;
  variancePct: number;
}

export type PlanStatus = 'ABOVE_PLAN' | 'ON_PLAN' | 'BELOW_PLAN';

export interface PlannedVsActualResourceRowDto {
  employeeId: number;
  employeeName: string;
  projectId: number;
  projectName: string;
  plannedHours: number;
  actualHours: number;
  plannedUtilizationPct: number;
  actualUtilizationPct: number;
  varianceHours: number;
  variancePct: number;
  status: PlanStatus;
}

export interface PlannedVsActualSummaryDto {
  cards: PlannedVsActualCardsDto;
  projectRows: PlannedVsActualProjectRowDto[];
  resourceRows: PlannedVsActualResourceRowDto[];
}

export interface PlannedVsActualFilterParams {
  from?: string;
  to?: string;
  projectId?: number;
  employeeId?: number;
}

export function usePlannedVsActualSummary(filters: PlannedVsActualFilterParams, enabled: boolean = true) {
  return useQuery({
    queryKey: ['planned-vs-actual', 'summary', filters],
    queryFn: () =>
      api.get<PlannedVsActualSummaryDto>('/planned-vs-actual/summary', { params: filters }).then(r => r.data),
    placeholderData: prev => prev,
    enabled,
  });
}
