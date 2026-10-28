import type { ApprovalPieceDto } from '../api/approvalPieces';
import { LineStatusBadge } from './taskStatus/LineStatusBadge';
import { fmtHours } from '../lib/eodFormat';

// ── TaskLinesTable ─────────────────────────────────────────────────────────────

export function TaskLinesTable({ taskLines, compact }: {
  taskLines: ApprovalPieceDto['taskLines'];
  compact?: boolean;
}) {
  if (!taskLines || taskLines.length === 0) return null;
  const pad = compact ? '4px 11px' : '6px 12px';
  const sz = compact ? 11 : 11.5;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'rgba(255,255,255,.02)' }}>
      {taskLines.map((t, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: pad, fontSize: sz, color: 'var(--txt-dim)',
          borderBottom: i < taskLines.length - 1 ? '1px solid var(--line)' : undefined,
        }}>
          <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: compact ? 100 : 110, flexShrink: 0 }}>{t.projectCode ?? '—'}</span>
          <div style={{ flex: 1 }}>
            <div>{t.categoryName ?? '—'}</div>
            {t.description && (
              <div style={{ fontSize: sz - 1, color: 'var(--txt-mut)', marginTop: 2 }}>{t.description}</div>
            )}
          </div>
          <span style={{ color: 'var(--txt)', fontWeight: 700, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
            {t.hours != null ? fmtHours(Number(t.hours)) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── LogLinesTable ─────────────────────────────────────────────────────────────

export function LogLinesTable({ piece, compact }: {
  piece: ApprovalPieceDto;
  compact?: boolean;
}) {
  const pad = compact ? '4px 11px' : '6px 12px';
  const sz = compact ? 11 : 11.5;
  const catWidth = compact ? 140 : 130;

  // V110+ entries: render per-category line items.
  if (piece.logLines && piece.logLines.length > 0) {
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'rgba(255,255,255,.02)' }}>
        {piece.logLines.map((ln, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
            padding: pad, fontSize: sz, color: 'var(--txt-dim)',
            borderBottom: i < piece.logLines.length - 1 ? '1px solid var(--line)' : undefined,
          }}>
            <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: catWidth, flexShrink: 0 }}>{ln.categoryName ?? '—'}</span>
            <span style={{ flex: 1 }}>{ln.description ?? ''}</span>
            <LineStatusBadge status={ln.taskStatus} blockerReason={ln.blockerReason} />
            <span style={{ color: 'var(--txt)', fontWeight: 700, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
              {ln.hours != null ? `${ln.hours}h` : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Legacy entry (pre-V110): no logLines rows but logSummary present.
  if (piece.logSummary) {
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'rgba(255,255,255,.02)' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: pad, fontSize: sz, color: 'var(--txt-dim)',
        }}>
          <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: catWidth, flexShrink: 0 }}>Summary</span>
          <span style={{ flex: 1 }}>{piece.logSummary}</span>
        </div>
      </div>
    );
  }

  return null;
}
