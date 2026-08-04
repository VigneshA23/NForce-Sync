import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { EodEntryDto } from './eod';

export interface ApprovalActionDto {
  id: number;
  eodEntryId: number;
  actorId: number;
  actorName: string;
  action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  comment: string | null;
  billableOverride: boolean | null;
  actedAt: string;
}

export function usePendingApprovals(enabled = true) {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<EodEntryDto[]>('/approvals/pending').then(r => r.data),
    enabled,
  });
}

/**
 * Live pending-approval count, sharing the same query cache as `usePendingApprovals`
 * (same queryKey — one network call feeds both) so the sidebar badge, Team Dashboard
 * KPI, and Approvals page can never disagree.
 */
export function usePendingApprovalsCount(enabled = true) {
  const { data } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<EodEntryDto[]>('/approvals/pending').then(r => r.data),
    enabled,
    select: (d) => d.length,
  });
  return data ?? 0;
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, billableOverride, comment }: {
      entryId: number;
      billableOverride?: boolean;
      comment?: string;
    }) =>
      api.post<EodEntryDto>(`/approvals/${entryId}/approve`,
        billableOverride !== undefined || comment
          ? { billableOverride, comment }
          : undefined,
      ).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, comment }: { entryId: number; comment: string }) =>
      api.post<EodEntryDto>(`/approvals/${entryId}/reject`, { comment }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useRequestChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, comment }: { entryId: number; comment: string }) =>
      api.post<EodEntryDto>(`/approvals/${entryId}/request-changes`, { comment }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

/** PM-only — entries this PM has personally decided on. Powers the Approved/Rejected/Changes Requested tabs. */
export function useDecidedApprovals(status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', enabled = true) {
  return useQuery({
    queryKey: ['approvals', 'decided', status],
    queryFn: () => api.get<EodEntryDto[]>('/approvals/history', { params: { status } }).then(r => r.data),
    enabled,
  });
}

/** Full approve/reject/request-changes audit trail for one entry — fetched lazily on row expand. */
export function useApprovalHistory(entryId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['approvals', 'history', entryId],
    queryFn: () => api.get<ApprovalActionDto[]>(`/approvals/${entryId}/history`).then(r => r.data),
    enabled,
  });
}

export function useBatchApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryIds: number[]) =>
      api.post<EodEntryDto[]>('/approvals/batch-approve', { entryIds }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}
