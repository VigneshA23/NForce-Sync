import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar, avatarColor } from './BlockerThread';
import { ClarificationThreadView } from './ClarificationThread';
import { StatusBadge, StatusDropdown } from './StatusDropdown';
import type { ClarificationStatusValue } from '../api/eodClarification';
import {
  useClarificationStatus, useClarificationStatusForApprovals, useMarkClarificationRead,
  useOpenClarificationWithMessage, useSetClarificationStatus,
} from '../api/eodClarification';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { extractError } from '../lib/extractError';
import { formatDate } from '../lib/date';
import { scopeFor } from '../lib/clarificationGate';
import { isReadOnlyPm } from '../lib/pmReadOnly';
import { CLARIFICATION_STATUS_META, CLARIFICATION_STATUS_OPTIONS } from '../lib/clarificationStatus';

/**
 * Floating chat box (bottom-right), styled like the Blockers conversation panel, for one entry's EOD Clarification conversation — the single
 * conversation UI for the Approvals pages (reviewer) and the employee's EOD History / SubmitEOD
 * (employee). It reuses ClarificationThreadView and the existing reply / attachment API; the only
 * new server call is "open with first message".
 *
 * Everything shown comes from the server's own verdict for THIS viewer, never from role:
 *  - the composer when the round is open and `canReply`, or — with no open round — when `canOpen`
 *    (then the FIRST message creates the round and notifies the employee);
 *  - the status dropdown (Needs Response / Acknowledged / Resolved, as on Blockers) only when
 *    `canResolve` — the entry's owner and read-only viewers see a plain status chip; choosing
 *    Resolved asks for confirmation first;
 *  - a resolved thread stays readable, read-only.
 * Which side the viewer is on comes from ownership alone (scopeFor). Closing the popup resolves
 * nothing. Polls every 15s while open. A 403/409 on any action shows the server's message through
 * extractError() and the mutation hooks refresh the status immediately.
 */
export function ClarificationChatPopup({ entryId, employeeId, employeeName, entryDate, onClose, readOnly = false }: {
  entryId: number;
  /** Owner of the entry — decides the viewer's side via scopeFor(). */
  employeeId: number;
  employeeName: string;
  entryDate: string;
  onClose: () => void;
  /** Force a view-only chat — no composer, no status control — whatever the server flags say. The PM
   *  Approvals page sets it: Project Managers read clarifications, they never take part in them. */
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const [confirmingResolve, setConfirmingResolve] = useState(false);

  const scope = user ? scopeFor(employeeId, user.id) : 'lead';
  const reviewerQuery = useClarificationStatusForApprovals(entryId, scope === 'lead', true);
  const employeeQuery = useClarificationStatus(entryId, 'employee', scope === 'employee');
  const query = scope === 'lead' ? reviewerQuery : employeeQuery;
  const status = query.data;

  const openWithMessage = useOpenClarificationWithMessage();
  const setStatus = useSetClarificationStatus();
  const markRead = useMarkClarificationRead(scope);

  // Opening the chat counts as reading it (clears the unread dot in the inboxes).
  const roundId = status?.clarificationId ?? null;
  useEffect(() => {
    if (roundId != null) markRead.mutate(entryId);
    // markRead is a fresh object each render; re-marking is only wanted when the round changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, roundId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = status?.open === true;
  const resolved = status != null && !open && status.status === 'RESOLVED';
  // No open round: only a reviewer who canOpen may type — and that first message opens it.
  const canStart = scope === 'lead' && !open && status?.canOpen === true;
  // Project Managers are read-only: even if a flag said otherwise, no composer and no status control.
  const readOnlyPm = (readOnly || isReadOnlyPm(user?.role)) && scope === 'lead';
  const composerEnabled = !readOnlyPm && (open ? status?.canReply === true : canStart);

  async function changeStatus(next: ClarificationStatusValue) {
    try {
      await setStatus.mutateAsync({ entryId, status: next });
    } catch (err) {
      show(extractError(err), 'error');   // the hook also refreshes the status on 403/409
    }
  }

  async function handleResolve() {
    try {
      await setStatus.mutateAsync({ entryId, status: 'RESOLVED' });
      setConfirmingResolve(false);
    } catch (err) {
      setConfirmingResolve(false);
      show(extractError(err), 'error');
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Clarification with ${employeeName}`}
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 1300,
        width: 'min(440px, calc(100vw - 24px))', height: 'min(560px, calc(100vh - 40px))',
        display: 'flex', flexDirection: 'column',
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14,
        boxShadow: '0 18px 48px rgba(0,0,0,.5)', overflow: 'hidden',
      }}
    >
      {/* Header: who, which entry, status, close */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Avatar name={employeeName} bg={avatarColor(employeeName)} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {employeeName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>EOD entry for {formatDate(entryDate)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            title="Close (does not resolve the clarification)"
            style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 24 }}>
          {status?.status ? (
            status.open && status.canResolve && !readOnlyPm ? (
              <StatusDropdown
                status={status.status}
                options={CLARIFICATION_STATUS_OPTIONS}
                meta={CLARIFICATION_STATUS_META}
                disabled={setStatus.isPending || confirmingResolve}
                onChange={(next: ClarificationStatusValue) => {
                  if (next === status.status) return;
                  if (next === 'RESOLVED') setConfirmingResolve(true);
                  else void changeStatus(next);
                }}
              />
            ) : (
              <StatusBadge status={status.status} meta={CLARIFICATION_STATUS_META} />
            )
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
              {query.isPending ? 'Loading…' : 'No clarification yet'}
            </span>
          )}
        </div>
        {confirmingResolve && (
          <div style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12, color: 'var(--txt-mut)',
            background: 'var(--raised2)', border: '1px solid var(--line2)',
          }}>
            Resolve this clarification? It unblocks approving or rejecting {employeeName}&apos;s entry and
            notifies them. This cannot be undone.
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmingResolve(false)}
                disabled={setStatus.isPending}
                style={{ padding: '4px 11px', borderRadius: 6, fontSize: 12, border: '1px solid var(--line2)', background: 'none', color: 'var(--txt-dim)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleResolve()}
                disabled={setStatus.isPending}
                style={{
                  padding: '4px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: '1px solid rgba(47,182,124,.5)', background: 'rgba(47,182,124,.15)', color: 'var(--ok)',
                  cursor: setStatus.isPending ? 'not-allowed' : 'pointer', opacity: setStatus.isPending ? 0.6 : 1,
                }}
              >
                {setStatus.isPending ? 'Resolving…' : 'Yes, Resolve'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 16px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid var(--warn)', display: 'inline-block', alignSelf: 'flex-start', flexShrink: 0 }}>
          Conversation
        </div>
        {query.isError ? (
          <div style={{ fontSize: 12.5, color: 'var(--risk)' }}>Could not load this clarification.</div>
        ) : (
          <ClarificationThreadView
            entryId={entryId}
            scope={scope}
            canReply={composerEnabled}
            onSendOverride={canStart
              ? (message, files) => openWithMessage.mutateAsync({ entryId, message, files })
              : undefined}
            replyToLabel={scope === 'lead' ? (canStart ? `Message ${employeeName}` : `Reply to ${employeeName}`) : 'Reply to your reviewer'}
            visibilityNote={scope === 'lead' ? `Replies are visible to ${employeeName}` : 'Replies are visible to your reviewers'}
            emptyMessage={canStart
              ? `Type a message to start a clarification with ${employeeName}. They will be notified.`
              : 'No messages yet.'}
          />
        )}
        {status && !composerEnabled && (
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', paddingTop: 8, flexShrink: 0 }}>
            {resolved
              ? 'This clarification was resolved. The conversation is read-only.'
              : open
                ? 'View only — you can read this conversation but not reply to it.'
                : 'There is no open clarification on this entry.'}
          </div>
        )}
      </div>
    </div>
  );
}
