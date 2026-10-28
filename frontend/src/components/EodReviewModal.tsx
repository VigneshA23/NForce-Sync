/**
 * Shared EOD review modal — one component for every approver surface (Team Lead Approvals,
 * Reporting Manager / PM Pending Approvals). Hosts own the data fetching and the mutation
 * handlers; this only renders the submission and calls back with the reviewer's decision.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MessageCircleQuestion, X } from 'lucide-react';
import type { ApprovalPieceDto } from '../api/approvalPieces';
import { useClarificationStatusForApprovals } from '../api/eodClarification';
import { useAuth } from '../lib/auth';
import { clarificationMenuState, decisionBlockedReason, isBlockingStatus } from '../lib/clarificationGate';
import { Chip } from '../pages/approvals/shared';
import { LogLinesTable, TaskLinesTable } from './EodLinesTables';
import { dayTypeLabel, fmtDate, fmtHours, fmtInactivity, fmtRelative, totalHours } from '../lib/eodFormat';

// ── EodReviewModal ──────────────────────────────────────────────────────────

export function EodReviewModal({
  piece, onClose, onApprove, onReject, approveBusy, rejectBusy, clarificationOpen, initialMode, onOpenChat, clarificationReadOnly,
}: {
  piece: ApprovalPieceDto | null;
  onClose: () => void;
  onApprove: (pieceId: number, comment?: string) => Promise<unknown>;
  onReject: (pieceId: number, comment: string) => Promise<unknown>;
  approveBusy: boolean;
  rejectBusy: boolean;
  /** From the page's batched useEodInbox('lead') list; the modal's own polled status overrides it. */
  clarificationOpen: boolean;
  /** Which view the modal opens in - the row's kebab Reject opens it straight on the reason box. */
  initialMode: 'view' | 'reject';
  /** Opens the host page's chat popup for this piece's entry. */
  onOpenChat: (piece: ApprovalPieceDto) => void;
  /** View-only clarifications (the PM Approvals page) — see ApprovalsPageProps. */
  clarificationReadOnly: boolean;
}) {
  const [rejectComment, setRejectComment] = useState('');
  const [mode, setMode] = useState<'view' | 'reject'>(initialMode);
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = piece != null;

  // Esc closes; focus moves into the dialog on open and returns to the opener on close.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMode('view'); setRejectComment(''); onCloseRef.current(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open]);

  // The modal's own 15s-polled status is authoritative while it is open (so a round opened or
  // resolved elsewhere flips Approve/Reject without a reload); the batched list is the fallback.
  // An open round blocks EVERY project piece on the entry — rounds are per entry.
  const live = useClarificationStatusForApprovals(piece?.eodEntryId, piece != null, true, piece?.id);
  const blocked = live.data ? isBlockingStatus(live.data.status) : clarificationOpen;
  const blockedReason = decisionBlockedReason(blocked);

  if (!piece) return null;

  // Never offer reviewer actions on your own EOD — the server rejects it too (403).
  const isOwn = user != null && piece.employeeId === user.id;
  // Same rules as the row's kebab menu, from the server's flags (see clarificationMenuState).
  const menu = clarificationMenuState({
    isOwn, blockedByList: clarificationOpen, status: live.data, busy: approveBusy || rejectBusy,
    readOnlyReviewer: clarificationReadOnly,
  });
  const clarificationItem = menu.clarification.find(c => c.kind !== 'loading');

  // The Team Lead viewing their own piece after it moved up to the PM — wording differs from the PM's
  // "Escalated to you" chip, which stays as-is for every other viewer.
  const escalatedAwayFromMe = piece.escalatedAt != null && piece.escalatedToName != null
    && user != null && piece.approverId === user.id && piece.escalatedToId !== user.id;

  const isPlainLog = piece.entryForm === 'PLAIN_LOG';
  const isDecided  = piece.status === 'APPROVED' || piece.status === 'REJECTED';
  const total      = totalHours(piece);
  const overtime   = total > 8;

  function close() { setMode('view'); setRejectComment(''); onClose(); }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Review EOD — ${piece.employeeName}`}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          outline: 'none',
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 14, width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,.5)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>
              {piece.employeeName}
              <span style={{ fontWeight: 400, fontSize: 12.5, color: 'var(--txt-dim)', marginLeft: 8 }}>{piece.employeeCode}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{fmtDate(piece.entryDate)}</span>
              {piece.projectName && <><span>·</span><span>{piece.projectName}</span></>}
              {piece.approverType === 'LEAD' && piece.approverName && (
                <><span>·</span><span>Lead: {piece.approverName}</span></>
              )}
              <span>·</span>
              <span>Submitted {fmtRelative(piece.frozenAt)}</span>
            </div>
          </div>
          <button onClick={close} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 20px' }}>
          {/* Status / escalation chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {piece.status === 'APPROVED' && <Chip tone="ok">Approved</Chip>}
            {piece.status === 'REJECTED' && <Chip tone="risk">Rejected</Chip>}
            {piece.escalatedAt && piece.approverType === 'LEAD' && !escalatedAwayFromMe && (
              <Chip tone="warn">
                <AlertTriangle size={11} aria-hidden="true" /> Escalated to you · TL inactive {fmtInactivity(piece.hoursPending)}
              </Chip>
            )}
            {/* Team Lead's own view of a piece that has since moved up to the PM */}
            {escalatedAwayFromMe && (
              <Chip tone="warn">
                <AlertTriangle size={11} aria-hidden="true" /> Escalated to {piece.escalatedToName}
                {piece.hoursPending != null ? ` after ${Math.round(piece.hoursPending)}h` : ''}
              </Chip>
            )}
            {piece.approverType === 'PM' && !piece.escalatedAt && (
              <Chip tone="neutral" dashed>No team lead assigned</Chip>
            )}
            {dayTypeLabel(piece.dayType) && <Chip tone="neutral" dashed>{dayTypeLabel(piece.dayType)}</Chip>}
            {piece.workLocation && piece.workLocation !== 'OFFICE' && (
              <Chip tone="neutral" dashed>{piece.workLocation === 'HOME' ? 'WFH' : piece.workLocation}</Chip>
            )}
            <Chip tone={overtime ? 'warn' : 'neutral'}>{fmtHours(total)} logged</Chip>
            {overtime && <Chip tone="warn" dashed>Overtime +{fmtHours(total - 8)}</Chip>}
          </div>

          {/* Task table (PROJECT_GROUPED) */}
          {!isPlainLog && (
            <div style={{ marginBottom: 12 }}>
              <TaskLinesTable taskLines={piece.taskLines} />
            </div>
          )}

          {/* Log lines (PLAIN_LOG) — V110+ rows or legacy summary fallback */}
          {isPlainLog && (
            <div style={{ marginBottom: 12 }}>
              <LogLinesTable piece={piece} />
            </div>
          )}

          {/* Log notes, next day plan, remarks */}
          {(piece.logNotes || piece.nextDayPlan || piece.remarks) && (
            <div style={{ fontSize: 12.5, color: 'var(--txt-dim)', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {piece.logNotes    && <div><span style={{ fontWeight: 600, color: 'var(--txt)' }}>Notes: </span>{piece.logNotes}</div>}
              {piece.nextDayPlan && <div><span style={{ fontWeight: 600, color: 'var(--txt)' }}>Tomorrow: </span>{piece.nextDayPlan}</div>}
              {piece.remarks     && <div><span style={{ fontWeight: 600, color: 'var(--txt)' }}>Remarks: </span>{piece.remarks}</div>}
            </div>
          )}

          {/* Rejection comment (decided) */}
          {piece.comment && (
            <div style={{
              padding: '8px 12px', borderRadius: 7,
              background: 'rgba(228,55,61,.07)', border: '1px solid rgba(228,55,61,.2)',
              fontSize: 12.5, color: 'var(--risk)', marginBottom: 12,
            }}>
              <span style={{ fontWeight: 600 }}>Rejection reason: </span>{piece.comment}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isDecided && (
          <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--line)' }}>
            {mode === 'view' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => onApprove(piece.id).catch(() => {})}
                  disabled={approveBusy || rejectBusy || blocked}
                  title={blockedReason}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(47,182,124,.4)', background: 'rgba(47,182,124,.1)',
                    color: 'var(--ok)', cursor: (approveBusy || rejectBusy || blocked) ? 'not-allowed' : 'pointer',
                    opacity: (approveBusy || rejectBusy || blocked) ? 0.5 : 1, outline: 'none',
                  }}
                >
                  {approveBusy ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => setMode('reject')}
                  disabled={approveBusy || rejectBusy || blocked}
                  title={blockedReason}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(228,55,61,.3)', background: 'rgba(228,55,61,.07)',
                    color: 'var(--risk)', cursor: (approveBusy || rejectBusy || blocked) ? 'not-allowed' : 'pointer',
                    opacity: (approveBusy || rejectBusy || blocked) ? 0.5 : 1, outline: 'none',
                  }}
                >
                  Reject
                </button>
              </div>
              {/* From the server's flags only: absent on your own EOD and when there is nothing you may
                  open or view. Opens the chat popup (the first message there starts the round). */}
              {clarificationItem && (
                <button
                  onClick={() => onOpenChat(piece)}
                  style={{
                    alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: '1px solid rgba(224,169,59,.4)', background: 'var(--raised2)',
                    color: 'var(--warn)', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <MessageCircleQuestion size={12} aria-hidden="true" />
                  {clarificationItem.label}
                </button>
              )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>
                  Rejection reason <span style={{ color: 'var(--risk)' }}>*</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Explain why this submission is being rejected…"
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  style={{
                    width: '100%', resize: 'vertical', padding: '8px 10px', boxSizing: 'border-box',
                    background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6,
                    color: 'var(--txt)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--brand)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--line2)'; }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setMode('view'); setRejectComment(''); }}
                    style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, border: '1px solid var(--line2)', background: 'none', color: 'var(--txt-dim)', cursor: 'pointer', outline: 'none' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (rejectComment.trim()) {
                        onReject(piece.id, rejectComment.trim())
                          .then(() => { setMode('view'); setRejectComment(''); })
                          .catch(() => {});
                      }
                    }}
                    disabled={!rejectComment.trim() || rejectBusy || blocked}
                    title={blockedReason}
                    style={{
                      padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                      border: '1px solid rgba(228,55,61,.4)', background: 'rgba(228,55,61,.1)',
                      color: 'var(--risk)',
                      cursor: (!rejectComment.trim() || rejectBusy || blocked) ? 'not-allowed' : 'pointer',
                      opacity: (!rejectComment.trim() || rejectBusy || blocked) ? 0.5 : 1, outline: 'none',
                    }}
                  >
                    {rejectBusy ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

