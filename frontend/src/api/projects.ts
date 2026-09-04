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
  /** Display name of the project type. */
  projectType: string | null;
  /** Id of the same, for preselecting the edit form. */
  projectTypeId: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'ON_HOLD';
  /** The Team Lead who approves this project's EOD entries. */
  pmId: number | null;
  pmName: string | null;
  /** The overseeing PM — whose Approvals queue, dashboard and reports this project feeds. */
  projectManagerId: number | null;
  projectManagerName: string | null;
  startDate: string | null;
  endDate: string | null;
  allocatedHeadcount: number;
}

export interface CreateProjectPayload {
  code: string;
  name: string;
  /** Required when the chosen project type has requiresClient; forced to null otherwise. */
  client?: string | null;
  projectTypeId: number;
  startDate: string;
  /** Null means the project is ongoing — no fixed end date. */
  endDate?: string | null;
  /** The project's Team Lead. Must be an active MANAGER. */
  pmId: number;
  /** The overseeing PM. Must be an active PM. */
  projectManagerId: number;
}

export interface UpdateProjectPayload {
  /** Editable; must stay unique across projects (server returns 409 on a clash). */
  code: string;
  name: string;
  client?: string | null;
  projectTypeId: number;
  status: ProjectFullDto['status'];
  startDate: string;
  endDate?: string | null;
  /** The project's Team Lead. The existing holder may be re-sent even if now out-of-role. */
  pmId: number;
  /** The overseeing PM. Same grandfathering as pmId. */
  projectManagerId: number;
}

export interface EmployeeRefDto {
  id: number;
  fullName: string;
  employeeCode: string;
  /**
   * The employee's reporting manager. A project is only allocatable to them when its Team Lead
   * (`ProjectFullDto.pmId`) is this person — see the Project filter in AllocationModal.
   * `managerName` is display-only, for naming them when no project qualifies. Null when unset.
   */
  managerId: number | null;
  managerName: string | null;
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
  /** Share (1-100) of the employee's available capacity planned for this project. */
  allocationPct: number;
}

/** Assigns one employee to one project for a date range at a given capacity share. */
export interface CreateAllocationPayload {
  employeeId: number;
  projectId: number;
  effectiveFrom: string;
  /** Null leaves the assignment open-ended. */
  effectiveTo?: string | null;
  allocationPct: number;
}

/** In-place edit of an allocation's dates and capacity share. Employee and project are not changeable. */
export interface UpdateAllocationPayload {
  effectiveFrom: string;
  effectiveTo?: string | null;
  allocationPct: number;
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

/** Users who may be a project's Team Lead — active Team Leads (MANAGER) only. */
export async function listAssignableLeads(): Promise<EmployeeRefDto[]> {
  const res = await api.get<EmployeeRefDto[]>('/projects/leads');
  return res.data;
}

/** Users who may oversee a project as its PM — active PM accounts. */
export async function listAssignableProjectManagers(): Promise<EmployeeRefDto[]> {
  const res = await api.get<EmployeeRefDto[]>('/projects/managers');
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

export function useAssignableProjectManagers() {
  return useQuery({ queryKey: ['projects', 'managers'], queryFn: listAssignableProjectManagers });
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
