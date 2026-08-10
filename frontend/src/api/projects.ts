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
  /** Display name of the billing model; null when unset. */
  billingModel: string | null;
  /** Id of the same, for preselecting the edit form. */
  billingModelId: number | null;
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
  billingModelId?: number | null;
  startDate: string;
  /** Null means the project is ongoing — no fixed end date. */
  endDate?: string | null;
  /** The project's TL. Must be an active MANAGER (Team Lead) or PM. */
  pmId: number;
}

export interface UpdateProjectPayload {
  name: string;
  client?: string | null;
  projectType: string;
  billingModelId?: number | null;
  status: ProjectFullDto['status'];
  startDate: string;
  endDate?: string | null;
  /** The project's TL. The existing holder may be re-sent even if now out-of-role. */
  pmId: number;
}

export interface EmployeeRefDto {
  id: number;
  fullName: string;
  employeeCode: string;
}

export interface AllocationDto {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  projectId: number;
  projectCode: string;
  projectName: string;
  effectiveFrom: string;
  /** Null means the assignment is open-ended. */
  effectiveTo: string | null;
}

/** Assigns one employee to one project for a date range. */
export interface CreateAllocationPayload {
  employeeId: number;
  projectId: number;
  effectiveFrom: string;
  /** Null leaves the assignment open-ended. */
  effectiveTo?: string | null;
}

/** In-place edit of an allocation's dates. Employee and project are not changeable. */
export interface UpdateAllocationPayload {
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

/** Users who may be a project's TL — active Team Leads (MANAGER) and Project Managers. */
export async function listAssignableLeads(): Promise<EmployeeRefDto[]> {
  const res = await api.get<EmployeeRefDto[]>('/projects/leads');
  return res.data;
}

export async function createAllocation(data: CreateAllocationPayload): Promise<AllocationDto> {
  const res = await api.post<AllocationDto>('/allocations', data);
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

export function useAssignableLeads() {
  return useQuery({ queryKey: ['projects', 'leads'], queryFn: listAssignableLeads });
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
