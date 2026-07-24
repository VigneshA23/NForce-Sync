import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { EodEntryDto } from './eod';

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<EodEntryDto[]>('/approvals/pending').then(r => r.data),
  });
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
