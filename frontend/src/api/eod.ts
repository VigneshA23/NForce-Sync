import { api } from './client';

export interface EodTaskDto {
  id: number;
  projectId: number | null;
  projectCode: string | null;
  taskCategoryId: number | null;
  categoryName: string | null;
  description: string | null;
  hours: number | null;
  taskStatus: string;
  isBillable: boolean;
  blockerReason: string | null;
  supportNeeded: string | null;
}

export interface EodEntryDto {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  entryDate: string;
  status: string;
  workLocation: string | null;
  nextDayPlan: string | null;
  remarks: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: EodTaskDto[];
  reviewerComment: string | null;
}

export interface SaveTaskRequest {
  projectId: number | null;
  taskCategoryId: number | null;
  description: string | null;
  hours: number | null;
  taskStatus: string;
  isBillable: boolean;
  blockerReason: string | null;
  supportNeeded: string | null;
}

export interface SaveEodRequest {
  entryDate: string;
  workLocation: string | null;
  nextDayPlan: string | null;
  remarks: string | null;
  tasks: SaveTaskRequest[];
}

export async function saveDraft(req: SaveEodRequest): Promise<EodEntryDto> {
  const res = await api.post<EodEntryDto>('/eod/draft', req);
  return res.data;
}

export async function submitEntry(id: number): Promise<EodEntryDto> {
  const res = await api.post<EodEntryDto>(`/eod/${id}/submit`);
  return res.data;
}

export async function listEntries(
  employeeId?: number,
  from?: string,
  to?: string,
): Promise<EodEntryDto[]> {
  const res = await api.get<EodEntryDto[]>('/eod', {
    params: { employeeId, from, to },
  });
  return res.data;
}

export async function getEntry(id: number): Promise<EodEntryDto> {
  const res = await api.get<EodEntryDto>(`/eod/${id}`);
  return res.data;
}
