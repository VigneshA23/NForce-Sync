import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client';
import type { DateRange } from './teamLead';

// Single shared thread per blocker (EodTask), readable/writable by both the reporting
// employee and their Team Lead — backed by the real `blocker_reply` table (see
// BlockerConversationService on the backend). `scope` only selects which side's
// access-controlled route to call; the underlying data is the same row set either way.

export type ConversationScope = 'lead' | 'employee';

export interface BlockerAttachmentDto {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface BlockerReplyDto {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: 'EMPLOYEE' | 'TEAM_LEAD';
  createdAt: string;
  message: string;
  attachments: BlockerAttachmentDto[];
}

function basePath(scope: ConversationScope): string {
  return scope === 'lead' ? '/team-lead/blockers' : '/employee/blockers';
}

/** Edit an existing reply's message text — restricted server-side to the reply's own sender. */
export function useEditBlockerReply(taskId: number, scope: ConversationScope) {
  const qc = useQueryClient();
  return useMutation({
    // basePath(scope) already ends in "/blockers" (see above) — no second "/blockers" here.
    mutationFn: ({ replyId, message }: { replyId: number; message: string }) =>
      api.put(`${basePath(scope)}/replies/${replyId}`, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: threadKey(scope, taskId) }),
  });
}

/** Delete an existing reply — restricted server-side to the reply's own sender. */
export function useDeleteBlockerReply(taskId: number, scope: ConversationScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (replyId: number) => api.delete(`${basePath(scope)}/replies/${replyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: threadKey(scope, taskId) }),
  });
}

// Attachment bytes are fetched on demand (not inlined into the thread response) — cached
// as an object URL per attachment. Not explicitly revoked on cache eviction since another
// mounted <img>/link may still reference the same cached URL; the per-session attachment
// count on a single blocker thread is small enough that this isn't worth the complexity.
//
// Exported as a plain async function (not just the hook below) so BlockerThreadView can pass it
// into the generic ThreadView's `fetchAttachmentUrl` prop directly — a prop can't be a *call* to
// useBlockerAttachmentUrl itself (that would be a hook invoked inside a callback, which
// react-hooks/rules-of-hooks correctly rejects); ThreadView's own GenericAttachmentView is what
// actually calls useQuery, unconditionally, in its own body.
export function fetchBlockerAttachmentUrl(scope: ConversationScope, attachmentId: number): Promise<string> {
  return api.get(`${basePath(scope)}/attachments/${attachmentId}`, { responseType: 'blob' })
    .then(r => URL.createObjectURL(r.data as Blob));
}

export function useBlockerAttachmentUrl(scope: ConversationScope, attachmentId: number) {
  return useQuery({
    queryKey: ['blocker-attachment-blob', scope, attachmentId],
    queryFn: () => fetchBlockerAttachmentUrl(scope, attachmentId),
    staleTime: Infinity,
  });
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
    mutationFn: ({ message, files }: { message: string; files: File[] }) => {
      const form = new FormData();
      form.append('message', message);
      files.forEach(f => form.append('files', f));
      // No manual Content-Type here: axios strips whatever is set (instance default included)
      // and lets the browser generate `multipart/form-data; boundary=...` for a FormData body —
      // a hardcoded value with no boundary would be actively wrong if it ever did take effect.
      return api.post<BlockerReplyDto>(`${basePath(scope)}/${taskId}/replies`, form).then(r => r.data);
    },
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
