import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ApprovalPieceDto } from './approvalPieces';
import type { EodEntryDto } from './eod';
import type { MemberEodStatus, MemberEodStatusDto, DateRange } from './teamLead';

/** Why a reportee has no report to show: deadline passed / draft or today-not-yet / leave. */
export type MemberEodEmptyState = 'MISSING' | 'NOT_SUBMITTED' | 'ON_LEAVE';

export interface MemberEodDetailDto {
  employeeId: number;
  fullName: string;
  employeeCode: string;
  email: string | null;
  date: string;
  status: MemberEodStatus;
  emptyState: MemberEodEmptyState | null;
  /** Null unless there is a submitted report — drafts are never returned. */
  entry: EodEntryDto | null;
}

const STALE = 15_000;

export function useMyReportsMemberEod(employeeId: number, date: string, enabled = true) {
  return useQuery({
    queryKey: ['my-reports', 'eod', employeeId, date],
    queryFn: () =>
      api.get<MemberEodDetailDto>('/my-reports/eod', { params: { employeeId, date } }).then(r => r.data),
    enabled,
    staleTime: STALE,
    // 400/403/404 are answers, not transient faults — retrying only delays the message.
    retry: false,
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

export function useMyReportsPendingCount(enabled = true): number {
  return useQuery({
    queryKey: ['my-reports', 'approvals', 'pending'],
    queryFn: () =>
      api.get<ApprovalPieceDto[]>('/my-reports/approvals/pending').then(r => r.data),
    enabled,
    select: (d) => d.length,
    staleTime: STALE,
    refetchInterval: STALE,
    refetchIntervalInBackground: true,
  }).data ?? 0;
}

export function useMyReportsDecidedPieces(status: 'APPROVED' | 'REJECTED', enabled = true) {
  return useQuery({
    queryKey: ['my-reports', 'approvals', 'decided', status],
    queryFn: () =>
      api.get<ApprovalPieceDto[]>(`/my-reports/approvals/decided-entries?status=${status}`).then(r => r.data),
    enabled,
    staleTime: STALE,
    refetchInterval: STALE,
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
