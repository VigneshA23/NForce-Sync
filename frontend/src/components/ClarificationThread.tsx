import {
  useClarificationThread, useSendClarificationReply, usePmClarificationThread, fetchClarificationAttachmentUrl,
  type ClarificationScope,
} from '../api/eodClarification';
import { ThreadView } from './BlockerThread';

/**
 * Shared conversation UI for an EOD Clarification round — used by the Team Lead's EOD Inbox
 * detail panel, the employee's EOD entry view, and the PM's read-only EOD Inbox. Thin adapter
 * over BlockerThread.tsx's generic ThreadView (same attachments/emoji/@mention compose UI
 * Blockers uses, wired to the clarification hooks instead) rather than a bare textarea + Send
 * button forked from scratch. `scope` picks the access-controlled route; pass `readOnly` for
 * the PM's view-only surface (no reply box rendered at all, no mutation wired — matches how PM
 * Blockers omits reply entirely rather than disabling a control).
 */
export function ClarificationThreadView({ entryId, scope, replyToLabel, visibilityNote, isLocked, readOnly }: {
  entryId: number;
  /** Required unless `readOnly` — the PM's read-only view fetches via its own route
   *  (usePmClarificationThread) and never needs an access-controlled scope. */
  scope?: ClarificationScope;
  replyToLabel: string;
  visibilityNote: string;
  isLocked?: boolean;
  readOnly?: boolean;
}) {
  const writable = useClarificationThread(entryId, scope ?? 'lead', !readOnly && scope != null);
  const readOnlyQuery = usePmClarificationThread(entryId, !!readOnly);
  const { data: messages, isPending } = readOnly ? readOnlyQuery : writable;
  const sendReply = useSendClarificationReply(entryId, scope ?? 'lead');
  const attachmentScope = readOnly ? 'pm' : (scope ?? 'lead');

  return (
    <ThreadView
      messages={messages}
      isPending={isPending}
      replyToLabel={replyToLabel}
      visibilityNote={visibilityNote}
      isLocked={isLocked}
      lockedMessage="This clarification has been marked resolved. Reply is disabled."
      onSend={(message, files) => sendReply.mutateAsync({ message, files })}
      isSending={sendReply.isPending}
      fetchAttachmentUrl={id => fetchClarificationAttachmentUrl(attachmentScope, id)}
      attachmentUrlQueryKey={id => ['eod-clarification-attachment-blob', attachmentScope, id]}
      hideComposer={readOnly}
    />
  );
}
