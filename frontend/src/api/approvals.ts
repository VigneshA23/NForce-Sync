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
  actedAt: string;
}

// Polled (not just refetch-on-focus) for the same reason as the Team Dashboard queries in
// teamLead.ts: team membership (app_user.manager_id) is resolved live on every fetch, so a
// manager reassignment takes effect on the backend immediately — the only thing that can
// still show a since-reassigned employee's pending EOD to their old manager is this list's
// own cached response from before the reassignment. Polling (including while backgrounded)
// bounds that window to ~10s instead of leaving it to sit until the tab is refocused/reloaded.
const PENDING_STALE_TIME = 10_000;
const PENDING_REFETCH_INTERVAL = 10_000;

export function usePendingApprovals(enabled = true, range?: PendingApprovalsRange) {
  return useQuery({
    queryKey: pendingQueryKey(range),
    queryFn: () => api.get<EodEntryDto[]>('/approvals/pending', { params: range }).then(r => r.data),
    enabled,
    staleTime: PENDING_STALE_TIME,
    refetchInterval: PENDING_REFETCH_INTERVAL,
    refetchIntervalInBackground: true,
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
    staleTime: PENDING_STALE_TIME,
    refetchInterval: PENDING_REFETCH_INTERVAL,
    refetchIntervalInBackground: true,
  });
  return data ?? 0;
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, comment }: {
      entryId: number;
      comment?: string;
    }) =>
      api.post<EodEntryDto>(`/approvals/${entryId}/approve`,
        comment ? { comment } : undefined,
      ).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['team-lead'] });
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

