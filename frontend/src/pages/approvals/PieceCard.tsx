import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import { formatDate } from '../../lib/date';

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

  const decidedChipStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
  };

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
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  background: 'color-mix(in srgb, var(--warn) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
                  color: 'var(--warn)',
                }}>
                  <AlertTriangle size={10} aria-hidden="true" /> Escalated
                </span>
              </span>
            )}
            {mode === 'decided' && (
              piece.status === 'APPROVED' ? (
                <span style={{ ...decidedChipStyle, background: 'color-mix(in srgb, var(--ok) 12%, transparent)', color: 'var(--ok)', border: '1px solid color-mix(in srgb, var(--ok) 25%, transparent)' }}>
                  Approved
                </span>
              ) : (
                <span style={{ ...decidedChipStyle, background: 'color-mix(in srgb, var(--risk) 10%, transparent)', color: 'var(--risk)', border: '1px solid color-mix(in srgb, var(--risk) 25%, transparent)' }}>
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
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: '1px solid rgba(47,182,124,.4)', background: 'rgba(47,182,124,.08)',
                  color: 'var(--ok)', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--ok)'; }}
                onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                Approve
              </button>
              <button
                onClick={() => { setRejecting(true); setExpanded(true); }}
                disabled={busy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: '1px solid rgba(228,55,61,.3)', background: 'rgba(228,55,61,.06)',
                  color: 'var(--risk)', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--risk)'; }}
                onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
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
              onClick={() => { setRejecting(false); setComment(''); setExpanded(false); }}
              style={{
                padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: '1px solid var(--line2)', background: 'none',
                color: 'var(--txt-dim)', cursor: 'pointer', outline: 'none',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={!comment.trim() || busy}
              style={{
                padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid rgba(228,55,61,.4)', background: 'rgba(228,55,61,.1)',
                color: 'var(--risk)',
                cursor: (!comment.trim() || busy) ? 'not-allowed' : 'pointer',
                opacity: (!comment.trim() || busy) ? 0.5 : 1, outline: 'none',
              }}
              onFocus={e => {
                if (comment.trim() && !busy) e.currentTarget.style.boxShadow = '0 0 0 2px var(--risk)';
              }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
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
              {piece.workLocation && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Location: </span>
                  {piece.workLocation}
                </div>
              )}
              {piece.logLines && piece.logLines.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {piece.logLines.map((l, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>{l.categoryName} · {l.hours}h — </span>
                      {l.description}
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
