import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';

// ── types (mirror backend DTOs in com.nforceone.sync.reports) ────────────────────

export interface EodByEmployeeEntryDto {
  entryId: number;
  date: string;
  projectCode: string | null;
  categoryName: string | null;
  hours: number;
  billable: boolean;
}

export interface EodByEmployeeRowDto {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  designationName: string | null;
  projectCodes: string[];
  client: string | null;
  managerName: string | null;
  status: 'SUBMITTED' | 'LATE' | 'MISSING';
  entryCount: number;
  totalHours: number;
  billableHours: number;
  entries: EodByEmployeeEntryDto[];
}

export interface EodByEmployeeReportDto {
  employeeCount: number;
  entryCount: number;
  totalHours: number;
  employees: EodByEmployeeRowDto[];
}

export interface EodByEmployeeFilterParams {
  from?: string;
  to?: string;
  projectId?: number;
  client?: string;
  teamManagerId?: number;
  status?: string;
  billable?: string;
  employeeQuery?: string;
}

export type ExportFormat = 'CSV' | 'EXCEL' | 'PDF';

export interface EodByEmployeeExportParams extends EodByEmployeeFilterParams {
  employeeIds?: number[];
  format: ExportFormat;
}

// ── hooks ───────────────────────────────────────────────────────────────────────

export function useEodByEmployeeReport(filters: EodByEmployeeFilterParams) {
  return useQuery({
    queryKey: ['reports', 'eod-by-employee', filters],
    queryFn: () =>
      api.get<EodByEmployeeReportDto>('/reports/eod-by-employee', { params: filters }).then(r => r.data),
    placeholderData: prev => prev,
  });
}

/** Reads the filename off Content-Disposition; falls back to a generic name if the header is missing. */
function filenameFromResponse(contentDisposition: string | undefined, fallback: string): string {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

/** Excel/PDF/CSV download of the same report `useEodByEmployeeReport` renders on screen. */
export async function exportEodByEmployee(params: EodByEmployeeExportParams): Promise<void> {
  const { employeeIds, ...rest } = params;
  const response = await api.get('/reports/eod-by-employee/export', {
    params: { ...rest, employeeIds: employeeIds?.length ? employeeIds.join(',') : undefined },
    responseType: 'blob',
  });
  const extension = params.format === 'EXCEL' ? 'xlsx' : params.format.toLowerCase();
  const filename = filenameFromResponse(response.headers['content-disposition'], `eod-by-employee.${extension}`);
  downloadBlob(response.data as Blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ── Missing EOD ────────────────────────────────────────────────────────────────

export interface MissingEodDayDto {
  date: string;
  status: 'SUBMITTED' | 'MISSED' | 'HOLIDAY' | 'WEEKEND' | 'LEAVE';
}

export interface MissingEodRowDto {
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  designationName: string | null;
  projectName: string | null;
  teamName: string | null;
  missingCount: number;
  totalWorkingDays: number;
  missingPct: number;
  status: 'MISSING' | 'AT_RISK';
  days: MissingEodDayDto[];
}

export interface MissingEodReportDto {
  employeeCount: number;
  totalMissingDays: number;
  employees: MissingEodRowDto[];
}

export interface MissingEodFilterParams {
  from?: string;
  to?: string;
  projectId?: number;
  teamManagerId?: number;
  employeeQuery?: string;
}

export function useMissingEodReport(filters: MissingEodFilterParams) {
  return useQuery({
    queryKey: ['reports', 'missing-eod', filters],
    queryFn: () =>
      api.get<MissingEodReportDto>('/reports/missing-eod', { params: filters }).then(r => r.data),
    placeholderData: prev => prev,
  });
}

export function useRemindEmployee() {
  return useMutation({
    mutationFn: ({ employeeId, filters, dates }: {
      employeeId: number;
      filters: MissingEodFilterParams;
      dates?: string[];
    }) =>
      api.post<{ remindedDays: number }>(
        `/reports/missing-eod/${employeeId}/remind`,
        { dates },
        { params: filters },
      ).then(r => r.data),
  });
}

export function useRemindAll() {
  return useMutation({
    mutationFn: (filters: MissingEodFilterParams) =>
      api.post<{ remindedCount: number }>(
        '/reports/missing-eod/remind-all',
        {},
        { params: filters },
      ).then(r => r.data),
  });
}
