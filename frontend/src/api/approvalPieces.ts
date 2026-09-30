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
  approverType: string; // LEAD | REPORTING_MANAGER | PM | ADMIN_GROUP | AUTO_APPROVED
  status: string;       // PENDING | APPROVED | REJECTED
  frozenAt: string;
  actedAt: string | null;
  comment: string | null;
  entryDate: string;
}

const STALE = 10_000;

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
