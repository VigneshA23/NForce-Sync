import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import { formatDate } from '../../lib/date';
import { timeAdjustmentLabel } from './shared';
import { LineStatusBadge } from '../../components/taskStatus/LineStatusBadge';
import {
  btnSuccess, btnNeutral, btnDanger, btnSm,
  textareaStyle, statusPillStyle,
} from '../../lib/uiStyles';

// ── helpers ───────────────────────────────────────────────────────────────────

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: { message?: string } } }).response;
    if (r?.data?.message) return r.data.message;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}

function pieceLabel(piece: ApprovalPieceDto): string {
  if (piece.entryForm === 'PLAIN_LOG') return 'Daily log';
  return piece.projectName ?? 'Non-project hours';
}

// ── shared PieceCard ──────────────────────────────────────────────────────────

interface PieceCardProps {
  piece: ApprovalPieceDto;
  /** pending: shows Approve/Reject; decided: read-only with decision info */
  mode: 'pending' | 'decided';
  onApprove?: (pieceId: number, comment?: string) => Promise<void>;
  onReject?: (pieceId: number, comment: string) => Promise<void>;
  busy?: boolean;
}

export function PieceCard({ piece, mode, onApprove, onReject, busy = false }: PieceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');

  const isEscalated = piece.escalatedAt != null;

  async function handleApprove() {
    if (!onApprove) return;
    await onApprove(piece.id);
  }

  async function handleReject() {
    const trimmed = comment.trim();
    if (!trimmed || !onReject) return;
    await onReject(piece.id, trimmed);
    setRejecting(false);
    setComment('');
  }

  const rowBg = isEscalated
    ? 'linear-gradient(90deg, color-mix(in srgb, var(--warn) 7%, transparent), transparent 45%)'
    : undefined;

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: rowBg }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 16px' }}>

        {/* Avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        }}>
          {initials(piece.employeeName)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>
              {piece.employeeName}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
              {piece.employeeCode}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-mut)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
              {pieceLabel(piece)}
            </span>
            {isEscalated && (
              <span title={piece.approverName ? `${piece.approverName} hasn't acted within SLA` : 'Escalated to you'}>
                <span style={statusPillStyle('var(--warn)')}>
                  <AlertTriangle size={10} aria-hidden="true" /> Escalated
                </span>
              </span>
            )}
            {mode === 'decided' && (
              piece.status === 'APPROVED' ? (
                <span style={statusPillStyle('var(--ok)')}>
                  Approved
                </span>
              ) : (
                <span style={statusPillStyle('var(--risk)')}>
                  Rejected
                </span>
              )
            )}
          </div>

          {/* Meta row */}
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{formatDate(piece.entryDate)}</span>
            {piece.approverName && piece.approverType === 'LEAD' && (
              <>
                <span>·</span>
                <span>Lead: {piece.approverName}</span>
              </>
            )}
            {mode === 'pending' && piece.hoursPending != null && (
              <>
                <span>·</span>
                <span style={{ color: isEscalated ? 'var(--warn)' : 'var(--txt-dim)' }}>
                  Pending {Math.round(piece.hoursPending)}h
                </span>
              </>
            )}
            {mode === 'decided' && piece.actedAt && (
              <>
                <span>·</span>
                <span>{piece.status === 'APPROVED' ? 'Approved' : 'Rejected'} {formatDate(piece.actedAt)}</span>
              </>
            )}
          </div>

          {/* Rejection comment (decided mode) */}
          {mode === 'decided' && piece.comment && piece.status === 'REJECTED' && (
            <div style={{ marginTop: 5, fontSize: 12, color: 'var(--txt-dim)', fontStyle: 'italic' }}>
              "{piece.comment}"
            </div>
          )}
        </div>

        {/* Actions / expand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          {mode === 'pending' && !rejecting && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="nf-btn nf-btn--success"
                style={{ ...btnSuccess, ...btnSm }}
              >
                Approve
              </button>
              <button
                onClick={() => { setRejecting(true); setExpanded(true); }}
                disabled={busy}
                className="nf-btn nf-btn--danger"
                style={{ ...btnDanger, ...btnSm }}
              >
                Reject
              </button>
            </div>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse' : 'Expand details'}
            style={{
              background: 'none', border: 'none', color: 'var(--txt-dim)',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', gap: 4,
              outline: 'none', borderRadius: 4, fontSize: 11.5, fontWeight: 500,
            }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--line2)'; }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            Details
            {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Reject form */}
      {mode === 'pending' && rejecting && (
        <div style={{
          borderTop: '1px solid var(--line)', padding: '12px 16px',
          background: 'var(--raised)', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>
            Rejection reason <span style={{ color: 'var(--risk)' }}>*</span>
          </div>
          <textarea
            rows={3}
            placeholder="Explain why this piece is being rejected…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setRejecting(false); setComment(''); setExpanded(false); }}
              className="nf-btn nf-btn--neutral"
              style={{ ...btnNeutral, ...btnSm }}
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={!comment.trim() || busy}
              className="nf-btn nf-btn--danger"
              style={{ ...btnDanger, ...btnSm }}
            >
              Confirm Reject
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail area */}
      {expanded && !rejecting && (
        <div style={{
          borderTop: '1px solid var(--line)', padding: '10px 16px 12px 58px',
          background: 'rgba(255,255,255,.015)', display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
            <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Submitted: </span>
            {formatDate(piece.frozenAt)}
          </div>
          {piece.entryForm === 'PLAIN_LOG' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
                <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Hours: </span>
                {(piece.logTotalHours ?? 0) === 0 ? 'Leave day' : `${piece.logTotalHours}h`}
              </div>
              {piece.dayType && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Day type: </span>
                  {piece.dayType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                </div>
              )}
              {timeAdjustmentLabel({
                timeAdjustmentType: piece.timeAdjustmentType ?? null,
                timeAdjustmentMinutes: piece.timeAdjustmentMinutes ?? null,
              }) && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Time adjustment: </span>
                  {timeAdjustmentLabel({
                    timeAdjustmentType: piece.timeAdjustmentType ?? null,
                    timeAdjustmentMinutes: piece.timeAdjustmentMinutes ?? null,
                  })}
                </div>
              )}
              {piece.workLocation && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Location: </span>
                  {piece.workLocation}
                </div>
              )}
              {piece.logLines && piece.logLines.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {piece.logLines.map((l, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
                      <span><span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>{l.categoryName} · {l.hours}h — </span>
                      {l.description}</span>
                      <LineStatusBadge status={l.taskStatus} blockerReason={l.blockerReason} />
                    </div>
                  ))}
                </div>
              ) : piece.logSummary ? (
                <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 2 }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Summary: </span>
                  {piece.logSummary}
                </div>
              ) : null}
              {piece.logNotes && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Notes: </span>
                  {piece.logNotes}
                </div>
              )}
              {piece.nextDayPlan && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Next-day plan: </span>
                  {piece.nextDayPlan}
                </div>
              )}
            </>
          )}
          {isEscalated && piece.escalatedAt && (
            <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>Escalated to you</span>
              {piece.approverName && ` — ${piece.approverName} hasn't acted within SLA`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
