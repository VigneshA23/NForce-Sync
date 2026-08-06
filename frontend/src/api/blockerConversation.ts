import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client';
import type { DateRange } from './teamLead';

// Single shared thread per blocker (EodTask), readable/writable by both the reporting
// employee and their Team Lead — backed by the real `blocker_reply` table (see
// BlockerConversationService on the backend). `scope` only selects which side's
// access-controlled route to call; the underlying data is the same row set either way.

export type ConversationScope = 'lead' | 'employee';

export interface BlockerReplyDto {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: 'EMPLOYEE' | 'TEAM_LEAD';
  createdAt: string;
  message: string;
}

function basePath(scope: ConversationScope): string {
  return scope === 'lead' ? '/team-lead/blockers' : '/employee/blockers';
}

function threadKey(scope: ConversationScope, taskId: number | undefined) {
  return ['blocker-thread', scope, taskId] as const;
}

// Polled rather than pushed — no websocket layer exists elsewhere in this app, so a short
// poll while a thread is open is the established pattern for "the other side might have
// replied" (matches the 30s/60s polling already used for notifications/live dashboards).
const THREAD_POLL_MS = 15_000;

export function useBlockerThread(taskId: number | undefined, scope: ConversationScope) {
  return useQuery({
    queryKey: threadKey(scope, taskId),
    queryFn: () => api.get<BlockerReplyDto[]>(`${basePath(scope)}/${taskId}/replies`).then(r => r.data),
    enabled: taskId != null,
    refetchInterval: taskId != null ? THREAD_POLL_MS : false,
  });
}

export function useSendBlockerReply(taskId: number, scope: ConversationScope, range?: DateRange) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api.post<BlockerReplyDto>(`${basePath(scope)}/${taskId}/replies`, { message }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadKey(scope, taskId) });
      if (scope === 'lead' && range) {
        qc.invalidateQueries({ queryKey: ['team-lead', 'blockers', range.from, range.to] });
      } else if (scope === 'employee') {
        qc.invalidateQueries({ queryKey: ['employee', 'dashboard-summary'] });
      }
    },
  });
}
