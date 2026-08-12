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
  /** Whether this task's project allows a billable flag at all (server-computed, mirrors ProjectDto.billableAllowed). */
  billableAllowed: boolean;
  /** Whether a Team Lead has explicitly decided this task's billable status (as opposed to it carrying isBillable's default). */
  billableDecided: boolean;
}

export interface EodEntryDto {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  entryDate: string;
  status: string;
  dayType: string;
  timeAdjustmentType: string | null;
  timeAdjustmentMinutes: number | null;
  isOvertime: boolean;
  overtimeHours: number | null;
  workLocation: string | null;
  nextDayPlan: string | null;
  remarks: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: EodTaskDto[];
  reviewerComment: string | null;
  /** PM-only enrichment — undefined/null for the Team Lead's own view of an entry. */
  escalated?: boolean | null;
  tlInactivityHours?: number | null;
  tlName?: string | null;
  tlId?: number | null;
  undertimeHours?: number | null;
  isResubmission?: boolean | null;
  /** Who last approved/rejected this entry (any role), and when — null while still SUBMITTED. */
  decidedByName?: string | null;
  decidedByRole?: string | null;
  decidedAt?: string | null;
}

export interface SaveTaskRequest {
  projectId: number | null;
  taskCategoryId: number | null;
  description: string | null;
  hours: number | null;
  /** Null while the employee hasn't chosen one — '' would fail enum parsing server-side. */
  taskStatus: string | null;
  isBillable: boolean;
  blockerReason: string | null;
  supportNeeded: string | null;
}

export interface SaveEodRequest {
  entryDate: string;
  dayType: string;
  timeAdjustmentType: string | null;
  timeAdjustmentMinutes: number | null;
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

/** Shift timings, monthly allowances and current usage for the logged-in employee. */
export interface TimeAdjustmentContextDto {
  shiftAssigned: boolean;
  shiftName: string | null;
  /** 'HH:mm:ss' from the backend's LocalTime. */
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftDurationMinutes: number;
  lateArrivalAllowance: number;
  earlyLeaveAllowance: number;
  interveningAllowance: number;
  lateArrivalUsed: number;
  earlyLeaveUsed: number;
  interveningUsed: number;
}

export async function getTimeAdjustmentContext(date: string): Promise<TimeAdjustmentContextDto> {
  const res = await api.get<TimeAdjustmentContextDto>('/eod/time-adjustment-context', {
    params: { date },
  });
  return res.data;
}

export async function getEntry(id: number): Promise<EodEntryDto> {
  const res = await api.get<EodEntryDto>(`/eod/${id}`);
  return res.data;
}
