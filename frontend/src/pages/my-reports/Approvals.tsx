import { useState } from 'react';
import { CheckCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import {
  useMyReportsPendingApprovals,
  useMyReportsApprovePiece,
  useMyReportsRejectPiece,
} from '../../api/myReports';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import { useToast } from '../../lib/toast';
import { formatDate } from '../../lib/date';

// ── helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: { message?: string } } }).response;
    if (r?.data?.message) return r.data.message;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}

// ── PieceCard ─────────────────────────────────────────────────────────────────

function PieceCard({ piece }: { piece: ApprovalPieceDto }) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');

  const { show } = useToast();
  const approvePiece = useMyReportsApprovePiece();
  const rejectPiece = useMyReportsRejectPiece();

  const busy = approvePiece.isPending || rejectPiece.isPending;

  async function handleApprove() {
    try {
      await approvePiece.mutateAsync({ pieceId: piece.id });
      show('Approved.', 'success');
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  async function handleReject() {
    const trimmed = comment.trim();
    if (!trimmed) return;
    try {
      await rejectPiece.mutateAsync({ pieceId: piece.id, comment: trimmed });
      show('Rejected.', 'success');
      setRejecting(false);
      setComment('');
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  const projectLabel = piece.entryForm === 'PLAIN_LOG' ? 'Daily log'
                     : (piece.projectName ?? 'Non-project hours');
  const pieceType = piece.approverType ?? 'REPORTING_MANAGER';

  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px' }}>

        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        }}>
          {initials(piece.employeeName)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>
              {piece.employeeName}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
              {piece.employeeCode}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-mut)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
              {projectLabel}
            </span>
          </div>

          {/* Meta row */}
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{formatDate(piece.entryDate)}</span>
            <span>·</span>
            <span
              style={{
                fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                background: 'color-mix(in srgb, var(--info) 12%, transparent)',
                color: 'var(--info)',
              }}
            >
              {pieceType.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Right column — Approve / Reject / expand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          {!rejecting && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleApprove}
                disabled={busy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: '1px solid rgba(47,182,124,.4)',
                  background: 'rgba(47,182,124,.08)',
                  color: 'var(--ok)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  outline: 'none',
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
                  border: '1px solid rgba(228,55,61,.3)',
                  background: 'rgba(228,55,61,.06)',
                  color: 'var(--risk)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  outline: 'none',
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
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
              outline: 'none', borderRadius: 4,
            }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--line2)'; }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            {expanded
              ? <ChevronDown size={15} aria-hidden="true" />
              : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Rejection form — inline, requires comment before confirming */}
      {expanded && rejecting && (
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
              onClick={() => { setRejecting(false); setComment(''); }}
              style={{
                padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: '1px solid var(--line2)', background: 'none',
                color: 'var(--txt-dim)', cursor: 'pointer', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--line2)'; }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={!comment.trim() || busy}
              style={{
                padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid rgba(228,55,61,.4)',
                background: 'rgba(228,55,61,.1)',
                color: 'var(--risk)',
                cursor: (!comment.trim() || busy) ? 'not-allowed' : 'pointer',
                opacity: (!comment.trim() || busy) ? 0.5 : 1,
                outline: 'none',
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

      {/* Expanded non-rejection detail area */}
      {expanded && !rejecting && (
        <div style={{
          borderTop: '1px solid var(--line)', padding: '10px 16px 12px 60px',
          background: 'rgba(255,255,255,.015)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginBottom: piece.entryForm === 'PLAIN_LOG' ? 8 : 0 }}>
            <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Frozen: </span>
            {formatDate(piece.frozenAt)}
          </div>
          {piece.entryForm === 'PLAIN_LOG' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
                <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Hours: </span>
                {(piece.logTotalHours ?? 0) === 0 ? 'Leave day' : `${piece.logTotalHours}h`}
              </div>
              {piece.logSummary && (
                <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Summary: </span>
                  {piece.logSummary}
                </div>
              )}
              {piece.logNotes && (
                <div style={{ fontSize: 12, color: 'var(--txt-dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  <span style={{ color: 'var(--txt-mut)', fontWeight: 600 }}>Notes: </span>
                  {piece.logNotes}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function MyReportsApprovals() {
  const { data: pieces, isPending, isError, refetch } = useMyReportsPendingApprovals();

  if (isPending) {
    return <GlobalLoader fullScreen={false} />;
  }

  if (isError) {
    return (
      <div>
        <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 20px' }}>
          Approval Queue
        </h1>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>
            Failed to load pending approvals.
          </div>
          <button
            onClick={() => refetch()}
            style={{
              padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)',
              borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const list = pieces ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 600 }}>
          My Reports — Approval Queue
        </p>
        <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Approval Queue
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Direct reports requiring your approval as Reporting Manager
        </p>
      </div>

      {/* Count badge */}
      {list.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            background: 'color-mix(in srgb, var(--warn) 12%, var(--panel))',
            border: '1px solid color-mix(in srgb, var(--warn) 28%, var(--line))',
            fontSize: 12, fontWeight: 600, color: 'var(--warn)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {list.length} pending piece{list.length !== 1 ? 's' : ''} awaiting review
          </span>
        </div>
      )}

      {/* Empty state */}
      {list.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '56px 20px' }}>
          <CheckCheck size={32} style={{ color: 'var(--ok)', marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>
            No pending approvals
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
            All your direct reports' EOD pieces are up to date.
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {list.map(piece => (
            <PieceCard key={piece.id} piece={piece} />
          ))}
        </Card>
      )}
    </div>
  );
}
