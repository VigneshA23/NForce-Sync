import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { EodEntryDto } from './eod';

/** Optional entryDate window — when supplied, both hooks below scope to it instead of the
 * full all-time backlog. Deliberately a plain {from,to} rather than importing teamLead's
 * DateRange, so this general approvals module doesn't depend on a lead-page-specific type. */
export interface PendingApprovalsRange {
  from: string;
  to: string;
}

// Undefined range collapses to a stable 'all' key/no query params — this is what keeps every
// unscoped caller (Shell's badge outside the dashboard, other pages) on the same cache entry
// they always shared, rather than splintering into one query per call site.
function pendingQueryKey(range?: PendingApprovalsRange) {
  return ['approvals', 'pending', range ? range.from : 'all', range ? range.to : 'all'] as const;
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
