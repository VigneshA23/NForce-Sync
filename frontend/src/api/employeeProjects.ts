import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { ProjectFullDto } from './projects';

export type { ProjectFullDto };

export interface ProjectDetailEmployeeDto {
  id: number;
  fullName: string;
  employeeCode: string;
}

export interface ProjectDetailDto {
  id: number;
  code: string;
  name: string;
  client: string | null;
  status: string;
  /** The Team Lead who approves this project's EOD entries; null when none is assigned. */
  pmId: number | null;
  pmName: string | null;
  startDate: string | null;
  endDate: string | null;
  employees: ProjectDetailEmployeeDto[];
}

/** Projects the signed-in Employee is personally allocated to — never their teammates' or Team Lead's. */
export async function listMyEmployeeProjects(date?: string): Promise<ProjectFullDto[]> {
  const res = await api.get<ProjectFullDto[]>('/employee/projects', { params: date ? { date } : undefined });
  return res.data;
}

/** Details for one of the signed-in Employee's own assigned projects; 403s otherwise. */
export async function getEmployeeProjectDetail(id: number): Promise<ProjectDetailDto> {
  const res = await api.get<ProjectDetailDto>(`/employee/projects/${id}`);
  return res.data;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export function useMyEmployeeProjects(date?: string) {
  return useQuery({ queryKey: ['employee', 'projects', date ?? 'today'], queryFn: () => listMyEmployeeProjects(date) });
}

export function useEmployeeProjectDetail(id: number | null) {
  return useQuery({
    queryKey: ['employee', 'project-detail', id],
    queryFn: () => getEmployeeProjectDetail(id as number),
    enabled: id != null,
  });
}
