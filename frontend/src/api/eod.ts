import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** Metadata only — file bytes are fetched on demand via getEodAttachmentDataUrl. */
export interface EodAttachmentDto {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  /** Null for an EOD-level attachment. */
  taskId: number | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface EodTaskDto {
  id: number;
  projectId: number | null;
  projectCode: string | null;
  taskCategoryId: number | null;
  categoryName: string | null;
  description: string | null;
  hours: number | null;
  taskStatus: string;
  blockerReason: string | null;
  supportNeeded: string | null;
  attachments: EodAttachmentDto[];
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
  /** EOD-level attachments only — a task's own attachments live on that EodTaskDto.attachments. */
  attachments: EodAttachmentDto[];
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
  blockerReason: string | null;
  supportNeeded: string | null;
  /** IDs of attachments (already uploaded via uploadEodAttachment) that belong to this task row —
   *  task rows are destroyed and recreated on every save, so this is how a task-level attachment
   *  survives across saves: the server re-points these IDs to the freshly-created task row. */
  attachmentIds: number[];
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
  /** IDs of attachments that belong to the overall EOD entry (not any specific task). */
  attachmentIds: number[];
}

export async function saveDraft(req: SaveEodRequest): Promise<EodEntryDto> {
  const res = await api.post<EodEntryDto>('/eod/draft', req);
  return res.data;
}

export async function submitEntry(id: number): Promise<EodEntryDto> {
  const res = await api.post<EodEntryDto>(`/eod/${id}/submit`);
  return res.data;
}

/**
 * A row as returned when `includeMissing` is on: the id is nullable, because a synthesized MISSED
 * day has no eod_entry record behind it. Deliberately a separate type — every other caller reads
 * only real records, and should not have to defend against a null id it can never receive.
 */
export type EodHistoryEntryDto = Omit<EodEntryDto, 'id'> & { id: number | null };

/**
 * @param includeMissing also return a synthetic MISSED row per overdue working day with no entry.
 *   Those rows have `id: null` — a missing day has no record behind it — so only ask for them
 *   where that is handled (the history list, which reads the result as EodHistoryEntryDto).
 *   Off by default.
 */
export async function listEntries(
  employeeId?: number,
  from?: string,
  to?: string,
  includeMissing?: boolean,
): Promise<EodEntryDto[]> {
  const res = await api.get<EodEntryDto[]>('/eod', {
    params: { employeeId, from, to, includeMissing: includeMissing || undefined },
  });
  return res.data;
}

/** Shift timings, the monthly minute budget and current usage for the logged-in employee. */
export interface TimeAdjustmentContextDto {
  shiftAssigned: boolean;
  shiftName: string | null;
  /** 'HH:mm:ss' from the backend's LocalTime. */
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftDurationMinutes: number;
  /** One pool of minutes shared across late arrival, mid-shift break and early log-off. */
  monthlyAdjustmentMinutes: number;
  /** Minutes spent this month, excluding drafts, rejected entries and the day being edited. */
  adjustmentMinutesUsed: number;
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

/** Single full entry by id — role-agnostic (EodAccessPolicy.canRead covers the owning employee
 *  plus every manager-tier role, PM included), so any of the three EOD Inbox pages can use this
 *  same hook for their "View EOD" panel without a per-role endpoint. */
export function useEodEntry(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['eod', 'entry', id],
    queryFn: () => getEntry(id!),
    enabled: enabled && id != null,
  });
}

/** Day Type / Work Location defaults for a date with no saved entry yet — see SubmitEOD.
 *  workingHoursPerDay is different: it's the live Super Admin Business Rules value, returned
 *  for every date regardless of whether a saved entry exists — same source EodService's
 *  hour-validation reads, so the form's target and its validation floor never disagree. */
export interface EodDayDefaultsDto {
  dayType: string;
  workLocation: string | null;
  workingHoursPerDay: number;
}

export async function getDayDefaults(date: string): Promise<EodDayDefaultsDto> {
  const res = await api.get<EodDayDefaultsDto>('/eod/day-defaults', { params: { date } });
  return res.data;
}

// ── Attachments ──────────────────────────────────────────────────────────────

/**
 * Uploads one file to an EOD entry, optionally scoped to a task row (omit `taskId` for an
 * EOD-level attachment). No manual Content-Type header: axios strips the instance default and
 * lets the browser generate the correct `multipart/form-data; boundary=...` for a FormData body
 * — a hardcoded value here previously broke every attachment upload in the app (see
 * blockerConversation.ts's identical note and client.ts, where the root-cause default header was
 * removed for exactly this reason).
 */
export async function uploadEodAttachment(
  entryId: number,
  file: File,
  taskId?: number,
  /** Fraction uploaded so far, 0–1 — driven by the browser's real upload byte counter
   *  (axios's onUploadProgress/XHR progress event), so it tracks actual transfer time rather
   *  than a fixed delay. Omitted when the browser can't report a total (rare, non-file bodies). */
  onProgress?: (fraction: number) => void,
): Promise<EodAttachmentDto> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post<EodAttachmentDto>(`/eod/${entryId}/attachments`, form, {
    params: { taskId },
    onUploadProgress: onProgress
      ? (evt) => { if (evt.total) onProgress(evt.loaded / evt.total); }
      : undefined,
  });
  return res.data;
}

export async function deleteEodAttachment(attachmentId: number): Promise<void> {
  await api.delete(`/eod/attachments/${attachmentId}`);
}

/**
 * Fetches one attachment's bytes and resolves to a `data:` URL rather than an object (`blob:`)
 * URL. Needed specifically for opening the file in a NEW tab (the "Preview" link, on both Submit
 * EOD and the Approvals modal — see previewEodAttachment): a `blob:` URL only resolves inside the
 * browsing context (and, in Chromium, sometimes the very renderer process) that minted it via
 * `URL.createObjectURL` — a new tab is not guaranteed to share that context, so the embedded
 * `<img>`/`<embed>` can fail to load with nothing but a blank pane and no console error to explain
 * why. A `data:` URL embeds the bytes directly, so it resolves the same way regardless of which
 * window renders it.
 */
export async function getEodAttachmentDataUrl(attachmentId: number): Promise<string> {
  const res = await api.get(`/eod/attachments/${attachmentId}`, { responseType: 'blob' });
  const blob = res.data as Blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read attachment'));
    reader.readAsDataURL(blob);
  });
}
