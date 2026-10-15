import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { EodEntryDto } from './eod';

export interface ApprovalPieceDto {
  id: number;
  eodEntryId: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  projectId: number | null;
  projectName: string | null;
  approverId: number | null;
  approverName: string | null;
  /** Who actually decided this piece — null while PENDING. The designated approver (approverName)
   *  is frozen at submission time and never changes, but the actual actor can differ from it (a
   *  Super Admin override, or the PM an escalated piece's fallback), so prefer this when showing
   *  "who approved/rejected this" and fall back to approverName only while still PENDING. */
  actedByName: string | null;
  approverType: string; // LEAD | REPORTING_MANAGER | PM | ADMIN_GROUP | AUTO_APPROVED
  status: string;       // PENDING | APPROVED | REJECTED
  frozenAt: string;
  actedAt: string | null;
  comment: string | null;
  entryDate: string;
  // PLAIN_LOG fields — null for PROJECT_GROUPED pieces
  entryForm: string;
  logSummary: string | null;
  logTotalHours: number | null;
  logNotes: string | null;
  // V110+ line items — empty [] for legacy PLAIN_LOG entries
  logLines: import('./eod').EodLogLineDto[];
  // Escalation fields — null when piece has not been escalated
  escalatedAt: string | null;
  escalatedToId: number | null;
  escalatedToName: string | null;
  hoursPending: number | null;
  // Day-type metadata — null for PROJECT_GROUPED pieces
  dayType: string | null;
  workLocation: string | null;
  nextDayPlan: string | null;
  remarks: string | null;
  // Task lines for PROJECT_GROUPED pieces — empty [] for PLAIN_LOG
  taskLines: { projectCode: string | null; projectName: string | null; categoryName: string | null; hours: number | null; description: string | null }[];
}

const STALE = 10_000;

export function usePendingPiecesCount(enabled = true): number {
  return useQuery({
    queryKey: ['v2', 'approvals', 'pending'],
    queryFn: () => api.get<ApprovalPieceDto[]>('/v2/approvals/pending').then(r => r.data),
    enabled,
    select: (d) => d.length,
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  }).data ?? 0;
}

/** Team Lead > Approvals Pending tab: LEAD-type pieces held by the signed-in user only (no reporting-manager
 *  or PM pieces). Optional entry-date window, e.g. the Team Dashboard KPI's range. */
export function useLeadPendingPieces(range?: { from: string; to: string }) {
  return useQuery({
    queryKey: ['v2', 'approvals', 'lead-pending', range?.from ?? null, range?.to ?? null],
    queryFn: () => api.get<ApprovalPieceDto[]>('/v2/approvals/lead-pending', { params: range }).then(r => r.data),
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  });
}

/** Same list as useLeadPendingPieces (same query key), as a count — the sidebar badge and the Team
 *  Dashboard KPI, which therefore can never disagree with the page they link to. */
export function useLeadPendingPiecesCount(enabled = true, range?: { from: string; to: string }): number {
  return useQuery({
    queryKey: ['v2', 'approvals', 'lead-pending', range?.from ?? null, range?.to ?? null],
    queryFn: () => api.get<ApprovalPieceDto[]>('/v2/approvals/lead-pending', { params: range }).then(r => r.data),
    enabled,
    select: (d) => d.length,
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  }).data ?? 0;
}

export function usePendingPieces() {
  return useQuery({
    queryKey: ['v2', 'approvals', 'pending'],
    queryFn: () => api.get<ApprovalPieceDto[]>('/v2/approvals/pending').then(r => r.data),
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  });
}

export function useEntryPieces(entryId: number | null | undefined) {
  return useQuery({
    queryKey: ['v2', 'approvals', 'entry', entryId],
    queryFn: async () => {
      const r = await api.get<ApprovalPieceDto[]>(`/v2/approvals/entry/${entryId}/pieces`);
      return r.data;
    },
    enabled: entryId != null,
    retry: false,
    staleTime: 30_000,
  });
}

export function useDecidedEntriesV2(status: 'APPROVED' | 'REJECTED') {
  return useQuery({
    queryKey: ['v2', 'approvals', 'decided', status],
    queryFn: () => api.get<EodEntryDto[]>(`/v2/approvals/decided-entries?status=${status}`).then(r => r.data),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

/** PM Approved/Rejected tabs — PROJECT_GROUPED pieces only (no PLAIN_LOG). */
export function useDecidedPmPieces(status: 'APPROVED' | 'REJECTED') {
  return useQuery({
    queryKey: ['v2', 'approvals', 'pm-decided', status],
    queryFn: () => api.get<ApprovalPieceDto[]>(`/v2/approvals/pm-decided-pieces?status=${status}`).then(r => r.data),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
}

export function useApprovePiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pieceId, comment }: { pieceId: number; comment?: string }) =>
      api.post<ApprovalPieceDto>(
        `/v2/approvals/pieces/${pieceId}/approve`,
        comment ? { comment } : undefined,
      ).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v2', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['eod'] });
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['team-lead'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useRejectPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pieceId, comment }: { pieceId: number; comment: string }) =>
      api.post<ApprovalPieceDto>(`/v2/approvals/pieces/${pieceId}/reject`, { comment }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['v2', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['eod'] });
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['team-lead'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
