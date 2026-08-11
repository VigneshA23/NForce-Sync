import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ProjectFullDto } from './projects';

export type { ProjectFullDto };

export interface ProjectCategoryDto {
  id: number;
  /** Optional — a category is generic master data, not tied to any one project. */
  projectId: number | null;
  projectName: string | null;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateCategoryPayload {
  /** Optional — omit for a category not tied to any project. */
  projectId?: number | null;
  name: string;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  status?: ProjectCategoryDto['status'];
}

/** Edit surface intentionally matches the "Existing Categories" table columns only. */
export interface UpdateCategoryPayload {
  name: string;
  description?: string | null;
  status?: ProjectCategoryDto['status'];
}

export interface DeleteCategoryResult {
  /** false when the category was deactivated instead of removed (it has EOD history). */
  deleted: boolean;
  category: ProjectCategoryDto | null;
}

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
  startDate: string | null;
  endDate: string | null;
  employees: ProjectDetailEmployeeDto[];
}

/** Projects the signed-in Team Lead is personally allocated to (not their team's). */
export async function listMyLeadProjects(date?: string): Promise<ProjectFullDto[]> {
  const res = await api.get<ProjectFullDto[]>('/team-lead/projects', { params: date ? { date } : undefined });
  return res.data;
}

/** The signed-in Team Lead's own categories — generic master data, independent of any project. */
export async function listMyCategories(): Promise<ProjectCategoryDto[]> {
  const res = await api.get<ProjectCategoryDto[]>('/team-lead/categories');
  return res.data;
}

export async function createProjectCategory(data: CreateCategoryPayload): Promise<ProjectCategoryDto> {
  const res = await api.post<ProjectCategoryDto>('/team-lead/categories', data);
  return res.data;
}

export async function updateProjectCategory(id: number, data: UpdateCategoryPayload): Promise<ProjectCategoryDto> {
  const res = await api.put<ProjectCategoryDto>(`/team-lead/categories/${id}`, data);
  return res.data;
}

export async function deleteProjectCategory(id: number): Promise<DeleteCategoryResult> {
  const res = await api.delete<DeleteCategoryResult>(`/team-lead/categories/${id}`);
  return res.data;
}

/** Details + currently assigned employees for one of the Team Lead's own projects. */
export async function getProjectDetail(id: number): Promise<ProjectDetailDto> {
  const res = await api.get<ProjectDetailDto>(`/team-lead/projects/${id}`);
  return res.data;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export function useMyLeadProjects(date?: string) {
  return useQuery({ queryKey: ['team-lead', 'projects', date ?? 'today'], queryFn: () => listMyLeadProjects(date) });
}

export function useMyCategories() {
  return useQuery({ queryKey: ['team-lead', 'categories'], queryFn: listMyCategories });
}

export function useProjectDetail(id: number | null) {
  return useQuery({
    queryKey: ['team-lead', 'project-detail', id],
    queryFn: () => getProjectDetail(id as number),
    enabled: id != null,
  });
}

export function useCreateProjectCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProjectCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-lead', 'categories'] });
    },
  });
}

export function useUpdateProjectCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryPayload }) => updateProjectCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-lead', 'categories'] });
    },
  });
}

export function useDeleteProjectCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProjectCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-lead', 'categories'] });
    },
  });
}
