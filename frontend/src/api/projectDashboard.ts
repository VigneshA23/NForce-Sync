import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// ── types (mirror backend DTOs in com.nforceone.sync.projectdashboard) ────────────

export interface ProjectOptionDto {
  id: number;
  name: string;
}

export interface EmployeeOptionDto {
  id: number;
  fullName: string;
}

/** A "team" is every employee reporting to the same manager — there is no dedicated Team entity. */
export interface TeamOptionDto {
  managerId: number;
  managerName: string;
}

export interface ProjectDashboardFiltersDto {
  projects: ProjectOptionDto[];
  employees: EmployeeOptionDto[];
  teams: TeamOptionDto[];
  clients: string[];
}

export interface DashboardSummaryCardsDto {
  totalAssignedProjects: number;
  activeProjects: number;
  onHoldProjects: number;
  completedProjects: number;
  overallUtilizationPct: number;
  billableUtilizationPct: number;
  nonBillableUtilizationPct: number;
  plannedUtilizationPct: number;
  actualUtilizationPct: number;
  missingEodCount: number;
}

export interface ProjectUtilizationRowDto {
  projectId: number;
  projectName: string;
  plannedHours: number;
  actualHours: number;
  variance: number;
  utilizationPct: number;
}

export interface ResourceUtilizationRowDto {
  employeeId: number;
  employeeName: string;
  projectName: string;
  productiveHours: number;
  availableHours: number;
  utilizationPct: number;
}

export interface BillableSplitDto {
  billableHours: number;
  nonBillableHours: number;
  billablePct: number;
  nonBillablePct: number;
}

export interface PlannedVsActualDto {
  plannedHours: number;
  actualHours: number;
  variance: number;
  variancePct: number;
}

export interface MissingEodRowDto {
  employeeId: number;
  employeeName: string;
  projectName: string;
  teamName: string;
  date: string;
  daysMissing: number;
  status: 'MISSING' | 'AT_RISK';
}

export interface TaskCategoryUtilizationRowDto {
  category: string;
  hours: number;
  pctOfTotal: number;
}

export interface ProjectDashboardSummaryDto {
  cards: DashboardSummaryCardsDto;
  projectUtilization: ProjectUtilizationRowDto[];
  resourceUtilization: ResourceUtilizationRowDto[];
  billableSplit: BillableSplitDto;
  plannedVsActual: PlannedVsActualDto;
  missingEod: MissingEodRowDto[];
  taskCategoryBreakdown: TaskCategoryUtilizationRowDto[];
}

export interface ProjectDashboardFilterParams {
  from?: string;
  to?: string;
  projectId?: number;
  employeeId?: number;
  teamManagerId?: number;
  client?: string;
}

// ── hooks ───────────────────────────────────────────────────────────────────────

export function useProjectDashboardFilters() {
  return useQuery({
    queryKey: ['project-dashboard', 'filters'],
    queryFn: () => api.get<ProjectDashboardFiltersDto>('/project-dashboard/filters').then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useProjectDashboardSummary(filters: ProjectDashboardFilterParams, enabled: boolean = true) {
  return useQuery({
    queryKey: ['project-dashboard', 'summary', filters],
    queryFn: () =>
      api.get<ProjectDashboardSummaryDto>('/project-dashboard/summary', { params: filters }).then(r => r.data),
    placeholderData: prev => prev,
    enabled,
  });
}
