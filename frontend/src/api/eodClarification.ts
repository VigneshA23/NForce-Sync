import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client';

// EOD Clarification — a two-way conversation a Team Lead opens against an employee's SUBMITTED
// EOD entry from the Approvals detail popup. Structurally mirrors blockerConversation.ts, but
// keyed by eodEntryId (not taskId) and reopenable across multiple rounds — see
// EodClarificationService's javadoc on the backend for why. Polled, not pushed — same reasoning
// as Blockers (no websocket layer anywhere in this app).

export type ClarificationScope = 'lead' | 'employee';
export type InboxRole = 'lead' | 'pm' | 'employee';
export type ClarificationStatusValue = 'NEEDS_RESPONSE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface EodClarificationStatusDto {
  clarificationId: number | null;
  open: boolean;
  status: ClarificationStatusValue | null;
  openedAt: string | null;
  openedByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
}

export interface EodClarificationAttachmentDto {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface EodClarificationReplyDto {
  id: number;
  senderId: number;
  senderName: string;
  senderRole: 'EMPLOYEE' | 'TEAM_LEAD';
  createdAt: string;
  message: string;
  attachments: EodClarificationAttachmentDto[];
}

export interface EodInboxItemDto {
  clarificationId: number;
  eodEntryId: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  projectName: string | null;
  projectNames: string[];
  categoryNames: string[];
  entryDate: string;
  open: boolean;
  status: ClarificationStatusValue;
  openedAt: string;
  openedByName: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  replyCount: number;
  lastMessage: string | null;
  lastMessageAt: string;
  lastMessageSenderName: string | null;
  lastMessageSenderRole: 'EMPLOYEE' | 'TEAM_LEAD' | null;
  unread: boolean;
}

const THREAD_POLL_MS = 15_000;

function basePath(scope: ClarificationScope): string {
  return scope === 'lead' ? '/team-lead' : '/employee';
}

function statusKey(scope: ClarificationScope, entryId: number | undefined) {
  return ['eod-clarification-status', scope, entryId] as const;
}

function threadKey(scope: ClarificationScope, entryId: number | undefined) {
  return ['eod-clarification-thread', scope, entryId] as const;
}

/** Lightweight header — does this entry currently have an open clarification? Used by
 *  SubmitEOD/EodHistory to gate the edit-lock banner without loading the full thread. */
export function useClarificationStatus(entryId: number | undefined, scope: ClarificationScope, enabled = true) {
  return useQuery({
    queryKey: statusKey(scope, entryId),
    queryFn: () => api.get<EodClarificationStatusDto>(`${basePath(scope)}/eod/${entryId}/clarification`).then(r => r.data),
    enabled: enabled && entryId != null,
    refetchInterval: enabled && entryId != null ? THREAD_POLL_MS : false,
  });
}

export function useClarificationThread(entryId: number | undefined, scope: ClarificationScope, enabled = true) {
  return useQuery({
    queryKey: threadKey(scope, entryId),
    queryFn: () => api.get<EodClarificationReplyDto[]>(`${basePath(scope)}/eod/${entryId}/clarification/replies`).then(r => r.data),
    enabled: enabled && entryId != null,
    refetchInterval: enabled && entryId != null ? THREAD_POLL_MS : false,
  });
}

// Multipart, not JSON — matches useSendBlockerReply exactly (message + files together), now that
// clarification replies support attachments too (see EodClarificationService.reply on the backend).
export function useSendClarificationReply(entryId: number, scope: ClarificationScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ message, files }: { message: string; files: File[] }) => {
      const form = new FormData();
      form.append('message', message);
      files.forEach(f => form.append('files', f));
      return api.post<EodClarificationReplyDto>(`${basePath(scope)}/eod/${entryId}/clarification/replies`, form).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadKey(scope, entryId) });
      qc.invalidateQueries({ queryKey: statusKey(scope, entryId) });
      if (scope === 'lead') qc.invalidateQueries({ queryKey: ['eod-inbox'] });
    },
  });
}

/** Edit an existing reply's message text — restricted server-side to the reply's own sender. */
export function useEditClarificationReply(entryId: number, scope: ClarificationScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId, message }: { replyId: number; message: string }) =>
      api.put(`${basePath(scope)}/eod/clarification/replies/${replyId}`, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: threadKey(scope, entryId) }),
  });
}

/** Delete an existing reply — restricted server-side to the reply's own sender. */
export function useDeleteClarificationReply(entryId: number, scope: ClarificationScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (replyId: number) => api.delete(`${basePath(scope)}/eod/clarification/replies/${replyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: threadKey(scope, entryId) }),
  });
}

// Attachment bytes fetched on demand, mirroring useBlockerAttachmentUrl — cached as an object URL
// per attachment, not explicitly revoked (same tradeoff, see that hook's comment). Covers all
// three thread scopes, including 'pm' (its own read-only route), unlike ClarificationScope which
// only covers the two writable ones.
//
// Exported as a plain async function too (not just the hook below), same reason as
// fetchBlockerAttachmentUrl: ClarificationThreadView passes this into the generic ThreadView's
// `fetchAttachmentUrl` prop — a hook can't be invoked from inside a callback prop.
export function fetchClarificationAttachmentUrl(scope: InboxRole, attachmentId: number): Promise<string> {
  const path = scope === 'lead' ? '/team-lead/eod/attachments'
    : scope === 'employee' ? '/employee/eod/attachments'
    : '/pm-eod-inbox/attachments';
  return api.get(`${path}/${attachmentId}`, { responseType: 'blob' })
    .then(r => URL.createObjectURL(r.data as Blob));
}

export function useClarificationAttachmentUrl(scope: InboxRole, attachmentId: number) {
  return useQuery({
    queryKey: ['eod-clarification-attachment-blob', scope, attachmentId],
    queryFn: () => fetchClarificationAttachmentUrl(scope, attachmentId),
    staleTime: Infinity,
  });
}

/** Team Lead only — the Approvals detail popup's "Request Clarification" action. Opens an empty
 *  round with no first message, same as opening a Blocker conversation doesn't require one either
 *  — the caller navigates to EOD Inbox afterward and the TL types the actual question there. */
export function useOpenClarification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId }: { entryId: number }) =>
      api.post<EodClarificationStatusDto>(`/team-lead/eod/${entryId}/clarification`, {}).then(r => r.data),
    onSuccess: (_data, { entryId }) => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['eod-inbox'] });
      qc.invalidateQueries({ queryKey: statusKey('lead', entryId) });
    },
  });
}

/** Team Lead only — the status dropdown (NEEDS_RESPONSE / ACKNOWLEDGED / RESOLVED), same 3
 *  options and same TL-only change-ability as Blockers' status dropdown. Setting RESOLVED is
 *  terminal for the round and returns the entry to Approvals. */
export function useSetClarificationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, status }: { entryId: number; status: ClarificationStatusValue }) =>
      api.patch<EodClarificationStatusDto>(`/team-lead/eod/${entryId}/clarification/status`, { status }).then(r => r.data),
    onSuccess: (_data, { entryId }) => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['eod-inbox'] });
      qc.invalidateQueries({ queryKey: threadKey('lead', entryId) });
      qc.invalidateQueries({ queryKey: statusKey('lead', entryId) });
      qc.invalidateQueries({ queryKey: ['eod-clarification-status', 'approvals', entryId] });
    },
  });
}

/** Backs the Approve/Reject disabled state in the Approvals detail modal — role-agnostic (works
 *  for both a Team Lead and a scoped PM viewing the same entry), since /team-lead/... routes are
 *  role-locked and a PM would 403 calling useClarificationStatus(scope: 'lead') directly. */
export function useClarificationStatusForApprovals(entryId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['eod-clarification-status', 'approvals', entryId],
    queryFn: () => api.get<EodClarificationStatusDto>(`/approvals/${entryId}/clarification-status`).then(r => r.data),
    enabled: enabled && entryId != null,
  });
}

// ── EOD Inbox lists (Team Lead full, PM read-only) ──────────────────────────

function inboxPath(role: InboxRole): string {
  return role === 'lead' ? '/team-lead/eod-inbox'
    : role === 'employee' ? '/employee/eod-inbox'
    : '/pm-eod-inbox';
}

function inboxKey(role: InboxRole, open: boolean) {
  return ['eod-inbox', role, open] as const;
}

const INBOX_POLL_MS = 10_000;

export function useEodInbox(role: InboxRole, open: boolean, enabled = true) {
  return useQuery({
    queryKey: inboxKey(role, open),
    queryFn: () => api.get<EodInboxItemDto[]>(inboxPath(role), { params: { open } }).then(r => r.data),
    enabled,
    staleTime: INBOX_POLL_MS,
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: true,
  });
}

/** Sidebar nav badge — unread count (not just "open" count), sharing the "open" list's query
 *  cache (same key) so one network call feeds both this and the EOD Inbox page itself. Reading
 *  a row (useMarkClarificationRead) updates this same cache, so the badge drops immediately
 *  rather than waiting for the next poll. */
export function useEodInboxCount(role: InboxRole, enabled = true) {
  const { data } = useQuery({
    queryKey: inboxKey(role, true),
    queryFn: () => api.get<EodInboxItemDto[]>(inboxPath(role), { params: { open: true } }).then(r => r.data),
    enabled,
    select: (d) => d.filter(item => item.unread).length,
    staleTime: INBOX_POLL_MS,
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: true,
  });
  return data ?? 0;
}

function markReadPath(role: InboxRole, entryId: number): string {
  return role === 'pm' ? `/pm-eod-inbox/${entryId}/read` : `${basePath(role === 'lead' ? 'lead' : 'employee')}/eod/${entryId}/clarification/read`;
}

/** Opening a row's conversation panel marks that round read for the viewer — clears the
 *  unread/bold indicator on the row (and the sidebar badge, which reads the same cached list)
 *  without waiting for the next poll. Optimistically flips `unread` on the matching row across
 *  both the open and resolved list caches, since either can hold the entry being viewed. */
export function useMarkClarificationRead(role: InboxRole) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) => api.post(markReadPath(role, entryId), {}),
    onMutate: (entryId: number) => {
      for (const open of [true, false]) {
        qc.setQueryData<EodInboxItemDto[]>(inboxKey(role, open), old =>
          old?.map(item => (item.eodEntryId === entryId ? { ...item, unread: false } : item)));
      }
    },
  });
}

/** PM's read-only thread view — no reply mutation exists for this scope, matching the backend's
 *  no-write-endpoint-wired-at-all pattern for PmEodInboxController. */
export function usePmClarificationThread(entryId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['eod-clarification-thread', 'pm', entryId],
    queryFn: () => api.get<EodClarificationReplyDto[]>(`/pm-eod-inbox/${entryId}/replies`).then(r => r.data),
    enabled: enabled && entryId != null,
    refetchInterval: enabled && entryId != null ? THREAD_POLL_MS : false,
  });
}
