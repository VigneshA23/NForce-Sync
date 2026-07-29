import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface ProjectRef {
  id: number;
  code: string;
  name: string;
  client: string | null;
}

/**
 * The signed-in user's own allocated projects — the EOD Project dropdown source.
 * Scoped server-side to allocations whose effective window covers `date` (defaults to today),
 * so backdating an EOD only offers projects the person was actually on that day.
 */
export async function listProjects(date?: string): Promise<ProjectRef[]> {
  const res = await api.get<ProjectRef[]>('/projects', { params: date ? { date } : undefined });
  return res.data;
}

// ── Projects & Allocation management ──────────────────────────────────────────

export interface ProjectFullDto {
  id: number;
  code: string;
  name: string;
  client: string | null;
  projectType: string | null;
  billingModel: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'ON_HOLD';
  pmId: number | null;
  pmName: string | null;
  startDate: string | null;
  endDate: string | null;
  allocatedHeadcount: number;
}

export interface CreateProjectPayload {
  code: string;
  name: string;
  /** Required when projectType is 'CLIENT'; forced to null for 'INTERNAL'. */
  client?: string | null;
  projectType: string;
  billingModel?: string | null;
  startDate: string;
  /** Null means the project is ongoing — no fixed end date. */
  endDate?: string | null;
}

export interface UpdateProjectPayload {
  name: string;
  client?: string | null;
  projectType: string;
  billingModel?: string | null;
  status: ProjectFullDto['status'];
  startDate: string;
  endDate?: string | null;
}

export type AllocationType = 'PRIMARY' | 'SECONDARY';

export interface EmployeeRefDto {
  id: number;
  fullName: string;
  employeeCode: string;
  /** Percentage this employee is already committed to today, across all projects. */
  currentAllocationPct: number;
}

export interface AllocationDto {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  projectId: number;
  projectCode: string;
  projectName: string;
  allocationPct: number;
  allocationType: AllocationType;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * One allocation decision: a required primary project plus an optional secondary one,
 * sharing a single effective date range. The backend writes both rows atomically and
 * returns them, so this creates one or two allocations.
 */
/** In-place edit of one allocation. Employee and project are not changeable. */
export interface UpdateAllocationPayload {
  allocationPct: number;
  allocationType: AllocationType;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface CreateAssignmentPayload {
  employeeId: number;
  primaryProjectId: number;
  primaryPct: number;
  secondaryProjectId?: number | null;
  secondaryPct?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export async function listAllProjects(): Promise<ProjectFullDto[]> {
  const res = await api.get<ProjectFullDto[]>('/projects/all');
  return res.data;
}

export async function createProject(data: CreateProjectPayload): Promise<ProjectFullDto> {
  const res = await api.post<ProjectFullDto>('/projects', data);
  return res.data;
}

export async function updateProject(id: number, data: UpdateProjectPayload): Promise<ProjectFullDto> {
  const res = await api.patch<ProjectFullDto>(`/projects/${id}`, data);
  return res.data;
}

export async function listAllocations(projectId?: number): Promise<AllocationDto[]> {
  const res = await api.get<AllocationDto[]>('/allocations', { params: projectId ? { projectId } : undefined });
  return res.data;
}

export async function listAssignableEmployees(): Promise<EmployeeRefDto[]> {
  const res = await api.get<EmployeeRefDto[]>('/allocations/employees');
  return res.data;
}

export async function createAllocation(data: CreateAssignmentPayload): Promise<AllocationDto[]> {
  const res = await api.post<AllocationDto[]>('/allocations', data);
  return res.data;
}

export async function updateAllocation(id: number, data: UpdateAllocationPayload): Promise<AllocationDto> {
  const res = await api.patch<AllocationDto>(`/allocations/${id}`, data);
  return res.data;
}

export async function deleteAllocation(id: number): Promise<void> {
  await api.delete(`/allocations/${id}`);
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export function useAllProjects() {
  return useQuery({ queryKey: ['projects', 'all'], queryFn: listAllProjects });
}

export function useAllocations(projectId?: number) {
  return useQuery({ queryKey: ['allocations', projectId ?? 'all'], queryFn: () => listAllocations(projectId) });
}

export function useAssignableEmployees() {
  return useQuery({ queryKey: ['allocations', 'employees'], queryFn: listAssignableEmployees });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', 'all'] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProjectPayload }) => updateProject(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', 'all'] }),
  });
}

export function useCreateAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAllocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'all'] });
    },
  });
}

export function useUpdateAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAllocationPayload }) => updateAllocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'all'] });
    },
  });
}

export function useDeleteAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAllocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'all'] });
    },
  });
}
