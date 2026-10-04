import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ApprovalPieceDto } from './approvalPieces';
import type { MemberEodStatusDto, TeamLeadSummaryDto, DateRange } from './teamLead';

const STALE = 15_000;

export function useMyReportsSummary(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ['my-reports', 'summary', range.from, range.to],
    queryFn: () =>
      api.get<TeamLeadSummaryDto>('/my-reports/summary', { params: { from: range.from, to: range.to } })
        .then(r => r.data),
    enabled,
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  });
}

export function useMyReportsMemberStatuses(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ['my-reports', 'member-statuses', range.from, range.to],
    queryFn: () =>
      api.get<MemberEodStatusDto[]>('/my-reports/member-statuses', { params: { from: range.from, to: range.to } })
        .then(r => r.data),
    enabled,
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  });
}

export function useMyReportsPendingApprovals(enabled = true) {
  return useQuery({
    queryKey: ['my-reports', 'approvals', 'pending'],
    queryFn: () =>
      api.get<ApprovalPieceDto[]>('/my-reports/approvals/pending').then(r => r.data),
    enabled,
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  });
}

export function useMyReportsApprovePiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pieceId, comment }: { pieceId: number; comment?: string }) =>
      api.post<ApprovalPieceDto>(
        `/my-reports/approvals/pieces/${pieceId}/approve`,
        comment ? { comment } : undefined,
      ).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-reports'] });
      qc.invalidateQueries({ queryKey: ['team-lead'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMyReportsRejectPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pieceId, comment }: { pieceId: number; comment: string }) =>
      api.post<ApprovalPieceDto>(`/my-reports/approvals/pieces/${pieceId}/reject`, { comment }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-reports'] });
      qc.invalidateQueries({ queryKey: ['team-lead'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
