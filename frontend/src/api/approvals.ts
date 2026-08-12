import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { EodEntryDto } from './eod';

export interface PendingApprovalsRange {
  from: string;
  to: string;
}

export interface ApprovalActionDto {
  id: number;
  eodEntryId: number;
  actorId: number;
  actorName: string;
  action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'; // REQUEST_CHANGES: legacy, historical rows only
  comment: string | null;
  billableOverride: boolean | null;
  actedAt: string;
}

export function usePendingApprovals(enabled = true, range?: PendingApprovalsRange) {
  return useQuery({
    queryKey: pendingQueryKey(range),
    queryFn: () => api.get<EodEntryDto[]>('/approvals/pending', { params: range }).then(r => r.data),
    enabled,
  });
}

/**
 * Live pending-approval count, sharing the same query cache as `usePendingApprovals`
 * (same queryKey — one network call feeds both) so the sidebar badge, Team Dashboard
 * KPI, and Approvals page can never disagree — for whatever `range` (or lack of one)
 * all three are currently asking about.
 */
export function usePendingApprovalsCount(enabled = true, range?: PendingApprovalsRange) {
  const { data } = useQuery({
    queryKey: pendingQueryKey(range),
    queryFn: () => api.get<EodEntryDto[]>('/approvals/pending', { params: range }).then(r => r.data),
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
      qc.invalidateQueries({ queryKey: ['team-lead'] });
    },
  });
}

/**
 * Sets one task's billable flag during review — only while the entry is still SUBMITTED.
 *
 * Updates the pending-list cache directly (optimistically on request, reconciled with the
 * server's response on success) instead of invalidating — an invalidate would refetch the whole
 * pending list and re-render every row/modal in the middle of the TL ticking through tasks,
 * which reads as the checkbox area flickering for an unrelated network round trip.
 */
export function usePatchTaskBillable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, taskId, isBillable }: { entryId: number; taskId: number; isBillable: boolean }) =>
      api.patch<EodEntryDto>(`/approvals/${entryId}/tasks/${taskId}/billable`, { isBillable }).then(r => r.data),
    onMutate: async ({ entryId, taskId, isBillable }) => {
      const previous = qc.getQueriesData<EodEntryDto[]>({ queryKey: ['approvals', 'pending'] });
      qc.setQueriesData<EodEntryDto[]>({ queryKey: ['approvals', 'pending'] }, old =>
        old?.map(e => e.id !== entryId ? e : {
          ...e,
          tasks: e.tasks.map(t => t.id !== taskId ? t : { ...t, isBillable, billableDecided: true }),
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (updated) => {
      qc.setQueriesData<EodEntryDto[]>({ queryKey: ['approvals', 'pending'] }, old =>
        old?.map(e => e.id === updated.id ? updated : e),
      );
    },
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, comment }: { entryId: number; comment: string }) =>
      api.post<EodEntryDto>(`/approvals/${entryId}/reject`, { comment }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['team-lead'] });
    },
  });
}

// useRequestChanges removed in V44 — POST /approvals/{id}/request-changes no longer exists.
// useReject covers the same flow: a rejected entry is editable and resubmittable.

/** Entries this actor has personally decided on. Powers the Approved/Rejected tabs. */
export function useDecidedApprovals(status: 'APPROVED' | 'REJECTED', enabled = true) {
  return useQuery({
    queryKey: ['approvals', 'decided', status],
    queryFn: () => api.get<EodEntryDto[]>('/approvals/history', { params: { status } }).then(r => r.data),
    enabled,
  });
}

/** Full approve/reject audit trail for one entry — fetched lazily on row expand. */
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
      qc.invalidateQueries({ queryKey: ['team-lead'] });
    },
  });
}
function pendingQueryKey(range?: PendingApprovalsRange): readonly unknown[] {
  return range ? ['approvals', 'pending', range.from, range.to] : ['approvals', 'pending'];
}

