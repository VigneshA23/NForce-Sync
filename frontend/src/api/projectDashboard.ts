import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// ── types (mirror backend DTOs in com.nforceone.sync.projectdashboard) ────────────

export interface ProjectOptionDto {
  id: number;
  name: string;
  /** Null for internal work — a project with no client by design. */
  client: string | null;
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
  plannedUtilizationPct: number;
  actualUtilizationPct: number;
  missingEodCount: number;
  /** vs-previous-period deltas (percentage points); null when there's no previous-period data. */
  overallUtilizationDeltaPct: number | null;
  actualUtilizationDeltaPct: number | null;
  activeProjectsDelta: number | null;
}

export interface ProjectUtilizationRowDto {
  projectId: number;
  projectName: string;
  plannedHours: number;
  actualHours: number;
  variance: number;
  utilizationPct: number;
  /** Previous-period utilizationPct for this project; null if no prior-period activity. */
  previousUtilizationPct: number | null;
}

export interface UtilizationTrendPointDto {
  date: string;
  overallPct: number;
}

export interface ResourceUtilizationRowDto {
  employeeId: number;
  employeeName: string;
  projectName: string;
  productiveHours: number;
  availableHours: number;
  utilizationPct: number;
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
  missingEod: MissingEodRowDto[];
  taskCategoryBreakdown: TaskCategoryUtilizationRowDto[];
  utilizationTrend: UtilizationTrendPointDto[];
}

export interface ProjectDashboardFilterParams {
  from?: string;
  to?: string;
  projectId?: number;
  employeeId?: number;
  teamManagerId?: number;
  client?: string;
  /** Super Admin-only read override — narrows the system-wide dashboard to one Project
   *  Manager's portfolio (Super Admin Reportee Views enhancement); ignored server-side for a
   *  PM caller. See ProjectDashboardService.scopedProjects. */
  pmId?: number;
}

// ── hooks ───────────────────────────────────────────────────────────────────────

export function useProjectDashboardFilters(pmId?: number) {
  return useQuery({
    queryKey: ['project-dashboard', 'filters', pmId ?? null],
    queryFn: () => api.get<ProjectDashboardFiltersDto>('/project-dashboard/filters', { params: { pmId } }).then(r => r.data),
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
