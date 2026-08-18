import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { ProjectOptionDto } from './projectDashboard';
import type {
  EodByEmployeeFilterParams,
  EodByEmployeeReportDto,
  EodByEmployeeExportParams,
  ExportFormat,
  MissingEodFilterParams,
  MissingEodReportDto,
} from './reports';

// ── types ───────────────────────────────────────────────────────────────────────

export interface TeamReportFiltersDto {
  projects: ProjectOptionDto[];
  clients: string[];
}

// Re-export filter param types so callers don't need to import from both files
export type { EodByEmployeeFilterParams, ExportFormat, MissingEodFilterParams };

// ── filter options ──────────────────────────────────────────────────────────────

export function useTeamReportFilters() {
  return useQuery({
    queryKey: ['team-reports', 'filters'],
    queryFn: () =>
      api.get<TeamReportFiltersDto>('/team-reports/filters').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

// ── EOD by employee ─────────────────────────────────────────────────────────────

// `enabled` lets the page hold the request back until a date range has actually been chosen —
// the filters start blank, and from/to are required by the endpoint.
export function useTeamEodByEmployeeReport(filters: EodByEmployeeFilterParams, enabled = true) {
  return useQuery({
    queryKey: ['team-reports', 'eod-by-employee', filters],
    queryFn: () =>
      api.get<EodByEmployeeReportDto>('/team-reports/eod-by-employee', { params: filters }).then(r => r.data),
    placeholderData: prev => prev,
    enabled,
  });
}

function filenameFromResponse(contentDisposition: string | undefined, fallback: string): string {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
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

export async function exportTeamEodByEmployee(params: EodByEmployeeExportParams): Promise<void> {
  const { employeeIds, ...rest } = params;
  const response = await api.get('/team-reports/eod-by-employee/export', {
    params: { ...rest, employeeIds: employeeIds?.length ? employeeIds.join(',') : undefined },
    responseType: 'blob',
  });
  const extension = params.format === 'EXCEL' ? 'xlsx' : params.format.toLowerCase();
  const filename = filenameFromResponse(response.headers['content-disposition'], `team-eod.${extension}`);
  downloadBlob(response.data as Blob, filename);
}

// ── Missing EOD ────────────────────────────────────────────────────────────────

// TL missing-EOD filters don't include teamManagerId (TL IS the manager)
export interface TeamMissingEodFilterParams {
  from?: string;
  to?: string;
  projectId?: number;
  employeeQuery?: string;
}

export function useTeamMissingEodReport(filters: TeamMissingEodFilterParams, enabled = true) {
  return useQuery({
    queryKey: ['team-reports', 'missing-eod', filters],
    queryFn: () =>
      api.get<MissingEodReportDto>('/team-reports/missing-eod', { params: filters }).then(r => r.data),
    placeholderData: prev => prev,
    enabled,
  });
}

export function useTeamRemindEmployee() {
  return useMutation({
    mutationFn: ({ employeeId, filters, dates }: {
      employeeId: number;
      filters: TeamMissingEodFilterParams;
      dates?: string[];
    }) =>
      api.post<{ remindedDays: number }>(
        `/team-reports/missing-eod/${employeeId}/remind`,
        { dates },
        { params: filters },
      ).then(r => r.data),
  });
}

export function useTeamRemindAll() {
  return useMutation({
    mutationFn: (filters: TeamMissingEodFilterParams) =>
      api.post<{ remindedCount: number }>(
        '/team-reports/missing-eod/remind-all',
        {},
        { params: filters },
      ).then(r => r.data),
  });
}
