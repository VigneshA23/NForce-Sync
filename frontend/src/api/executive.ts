import { api } from './client';
import type { AuditLogDto } from './admin';

// ── Response types (mirror backend com.nforceone.sync.executive.dto.*) ────────

export interface WorkforceOverviewDto {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  usersByRole: Record<string, number>;
}

export interface ProjectPortfolioDto {
  totalProjects: number;
  activeProjects: number;
  onHoldProjects: number;
  completedProjects: number;
  inactiveProjects: number;
  byStatus: Record<string, number>;
}

export interface EodComplianceTrendPointDto {
  date: string;
  expected: number;
  submitted: number;
  missing: number;
  compliancePct: number;
}

export interface EodComplianceDto {
  expected: number;
  submitted: number;
  missing: number;
  compliancePct: number;
  trend: EodComplianceTrendPointDto[];
}

export interface EmployeeUtilizationDto {
  employeeId: number;
  fullName: string;
  employeeCode: string;
  utilizationPct: number;
  primaryProject: string | null;
}

export interface UtilizationTrendPointDto {
  date: string;
  utilizationPct: number;
}

export interface UtilizationOverviewDto {
  overallUtilizationPct: number | null;
  totalProductiveHours: number;
  totalAvailableHours: number;
  underutilizedCount: number;
  overloadedCount: number;
  underutilizedThresholdPct: number;
  overloadedThresholdPct: number;
  topUtilized: EmployeeUtilizationDto[];
  bottomUtilized: EmployeeUtilizationDto[];
  trend: UtilizationTrendPointDto[];
}

export interface ProjectAllocationDto {
  projectId: number;
  projectName: string;
  allocatedResources: number;
  allocationPctTotal: number;
}

export interface UnallocatedResourceDto {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  role: string;
}

export interface AllocationOverviewDto {
  totalAllocatedResources: number;
  resourcesWithNoActiveAllocation: number;
  byProject: ProjectAllocationDto[];
  unallocatedResources: UnallocatedResourceDto[];
}

export interface ProjectAttentionDto {
  projectId: number;
  projectName: string;
  projectManagerName: string | null;
  status: string;
  metric: string;
  reason: string;
}

export interface ExecutiveDashboardDto {
  from: string;
  to: string;
  workforce: WorkforceOverviewDto;
  projects: ProjectPortfolioDto;
  eodCompliance: EodComplianceDto;
  utilization: UtilizationOverviewDto;
  allocation: AllocationOverviewDto;
  projectsRequiringAttention: ProjectAttentionDto[];
  recentActivity: AuditLogDto[];
}

// ── Executive dashboard (Super Admin only) ─────────────────────────────────────

export async function getExecutiveDashboard(from: string, to: string): Promise<ExecutiveDashboardDto> {
  const res = await api.get<ExecutiveDashboardDto>('/executive/dashboard', { params: { from, to } });
  return res.data;
}
