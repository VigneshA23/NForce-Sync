import {
  useClarificationThread, useSendClarificationReply, useEditClarificationReply, useDeleteClarificationReply,
  usePmClarificationThread, fetchClarificationAttachmentUrl,
  type ClarificationScope,
} from '../api/eodClarification';
import { useAuth } from '../lib/auth';
import { ThreadView } from './BlockerThread';

/** The reviewing side is "Reviewer" whoever it is (TL-assigned employee, escalated PM, Super Admin);
 *  the employee side stays "Employee". Blockers keeps its own "Team Lead" wording. */
const CLARIFICATION_ROLE_LABELS = { EMPLOYEE: 'Employee', TEAM_LEAD: 'Reviewer' } as const;

/**
 * Shared conversation UI for an EOD Clarification round — used by the Team Lead's EOD Inbox
 * detail panel, the employee's EOD entry view, and the PM's read-only EOD Inbox. Thin adapter
 * over BlockerThread.tsx's generic ThreadView (same attachments/emoji/@mention compose UI
 * Blockers uses, wired to the clarification hooks instead) rather than a bare textarea + Send
 * button forked from scratch. `scope` picks the access-controlled route; pass `readOnly` for
 * the PM's view-only surface (no reply box rendered at all, no mutation wired — matches how PM
 * Blockers omits reply entirely rather than disabling a control).
 */
export function ClarificationThreadView({
  entryId, scope, replyToLabel, visibilityNote, isLocked, readOnly, canReply, onSendOverride, emptyMessage,
}: {
  entryId: number;
  /** Replaces the default "post a reply into the open round" send — used by the chat popup when
   *  no round is open yet, so the FIRST message opens the round. */
  onSendOverride?: (message: string, files: File[]) => Promise<unknown>;
  emptyMessage?: string;
  /** The viewer's server-computed reply capability (EodClarificationStatusDto.canReply). Pass
   *  `false` to show the thread without the composer or Edit/Delete — the read-only RM / PM
   *  state. Omitted = no restriction from this prop (the legacy callers). */
  canReply?: boolean;
  /** Required unless `readOnly` — the PM's read-only view fetches via its own route
   *  (usePmClarificationThread) and never needs an access-controlled scope. */
  scope?: ClarificationScope;
  replyToLabel: string;
  visibilityNote: string;
  isLocked?: boolean;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const writable = useClarificationThread(entryId, scope ?? 'lead', !readOnly && scope != null);
  const readOnlyQuery = usePmClarificationThread(entryId, !!readOnly);
  const { data: messages, isPending } = readOnly ? readOnlyQuery : writable;
  const sendReply = useSendClarificationReply(entryId, scope ?? 'lead');
  // Harmless to wire up even when readOnly (no request fires unless invoked) — just never
  // passed down to ThreadView below, the same way PM's view never gets an onSend either.
  const editReply = useEditClarificationReply(entryId, scope ?? 'lead');
  const deleteReply = useDeleteClarificationReply(entryId, scope ?? 'lead');
  const attachmentScope = readOnly ? 'pm' : (scope ?? 'lead');
  const noComposer = !!readOnly || canReply === false;

  return (
    <ThreadView
      messages={messages}
      isPending={isPending}
      replyToLabel={replyToLabel}
      visibilityNote={visibilityNote}
      isLocked={isLocked}
      lockedMessage="This clarification has been marked resolved. Reply is disabled."
      onSend={(message, files) => (onSendOverride ? onSendOverride(message, files) : sendReply.mutateAsync({ message, files }))}
      isSending={sendReply.isPending}
      fetchAttachmentUrl={id => fetchClarificationAttachmentUrl(attachmentScope, id)}
      attachmentUrlQueryKey={id => ['eod-clarification-attachment-blob', attachmentScope, id]}
      hideComposer={noComposer}
      currentUserId={noComposer ? undefined : user?.id}
      emptyMessage={emptyMessage}
      roleLabels={CLARIFICATION_ROLE_LABELS}
      onEditMessage={noComposer ? undefined : (replyId, message) => editReply.mutateAsync({ replyId, message })}
      onDeleteMessage={noComposer ? undefined : replyId => deleteReply.mutateAsync(replyId)}
    />
  );
}
