/**
 * Shared approvals UI used by both PM Approvals (/projects/approvals)
 * and Reporting Approvals (/my-reports/approvals). Parameterised by data
 * source (hooks passed in as data props) and tab list (which tabs to show).
 *
 * PM Approvals:       tabs = ['escalated','approved','rejected']
 * Reporting Approvals: tabs = ['pending','approved','rejected']
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCheck, ChevronDown, ChevronRight,
  RefreshCw, Search, X,
} from 'lucide-react';
import type { ApprovalPieceDto } from '../../api/approvalPieces';
import { splitPendingPieces } from './approvalsTabSplit';
export { splitPendingPieces };
import { FilterDropdown, toggleFilterVal } from '../../components/FilterDropdown';
import { GlobalLoader } from '../../components/GlobalLoader';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../lib/toast';
import { Card, Chip, extractError, initials } from './shared';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function fmtRelative(d: string | null | undefined): string {
  if (!d) return '—';
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

function fmtInactivity(hoursPending: number | null | undefined): string {
  if (hoursPending == null) return '';
  if (hoursPending >= 24) return `${Math.floor(hoursPending / 24)}d`;
  return `${Math.round(hoursPending)}h`;
}

function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}

function totalHours(piece: ApprovalPieceDto): number {
  if (piece.entryForm === 'PLAIN_LOG') return Number(piece.logTotalHours ?? 0);
  return (piece.taskLines ?? []).reduce((s, t) => s + Number(t.hours ?? 0), 0);
}

function dayTypeLabel(dt: string | null | undefined): string {
  switch (dt) {
    case 'FULL_DAY':           return 'Full Day';
    case 'HALF_DAY':           return 'Half Day';
    case 'FIRST_HALF_LEAVE':   return 'First Half Leave';
    case 'SECOND_HALF_LEAVE':  return 'Second Half Leave';
    case 'LEAVE':              return 'Leave';
    case 'HOLIDAY':            return 'Holiday';
    case 'WORK_FROM_HOME':     return 'WFH';
    default:                   return dt ?? '';
  }
}

// ── TaskLinesTable ─────────────────────────────────────────────────────────────

function TaskLinesTable({ taskLines, compact }: {
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

function LogLinesTable({ piece, compact }: {
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
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: pad, fontSize: sz, color: 'var(--txt-dim)',
            borderBottom: i < piece.logLines.length - 1 ? '1px solid var(--line)' : undefined,
          }}>
            <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: catWidth, flexShrink: 0 }}>{ln.categoryName ?? '—'}</span>
            <span style={{ flex: 1 }}>{ln.description ?? ''}</span>
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

// ── PieceReviewModal ──────────────────────────────────────────────────────────

function PieceReviewModal({
  piece, onClose, onApprove, onReject, approveBusy, rejectBusy,
}: {
  piece: ApprovalPieceDto | null;
  onClose: () => void;
  onApprove: (pieceId: number, comment?: string) => Promise<unknown>;
  onReject: (pieceId: number, comment: string) => Promise<unknown>;
  approveBusy: boolean;
  rejectBusy: boolean;
}) {
  const [rejectComment, setRejectComment] = useState('');
  const [mode, setMode] = useState<'view' | 'reject'>('view');

  if (!piece) return null;

  const isPlainLog = piece.entryForm === 'PLAIN_LOG';
  const isDecided  = piece.status === 'APPROVED' || piece.status === 'REJECTED';
  const total      = totalHours(piece);
  const overtime   = total > 8;

  function close() { setMode('view'); setRejectComment(''); onClose(); }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
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
            {piece.escalatedAt && piece.approverType === 'LEAD' && (
              <Chip tone="warn">
                <AlertTriangle size={11} aria-hidden="true" /> Escalated to you · TL inactive {fmtInactivity(piece.hoursPending)}
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
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => onApprove(piece.id).catch(() => {})}
                  disabled={approveBusy || rejectBusy}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(47,182,124,.4)', background: 'rgba(47,182,124,.1)',
                    color: 'var(--ok)', cursor: (approveBusy || rejectBusy) ? 'not-allowed' : 'pointer',
                    opacity: (approveBusy || rejectBusy) ? 0.6 : 1, outline: 'none',
                  }}
                >
                  {approveBusy ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => setMode('reject')}
                  disabled={approveBusy || rejectBusy}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(228,55,61,.3)', background: 'rgba(228,55,61,.07)',
                    color: 'var(--risk)', cursor: (approveBusy || rejectBusy) ? 'not-allowed' : 'pointer',
                    opacity: (approveBusy || rejectBusy) ? 0.6 : 1, outline: 'none',
                  }}
                >
                  Reject
                </button>
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
                    disabled={!rejectComment.trim() || rejectBusy}
                    style={{
                      padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                      border: '1px solid rgba(228,55,61,.4)', background: 'rgba(228,55,61,.1)',
                      color: 'var(--risk)',
                      cursor: (!rejectComment.trim() || rejectBusy) ? 'not-allowed' : 'pointer',
                      opacity: (!rejectComment.trim() || rejectBusy) ? 0.5 : 1, outline: 'none',
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

// ── PieceCard ─────────────────────────────────────────────────────────────────

function PieceCard({
  piece, onOpenModal, tab,
}: {
  piece: ApprovalPieceDto;
  onOpenModal: () => void;
  tab: ApprovalsTab;
}) {
  const [expanded, setExpanded] = useState(false);

  const isPlainLog   = piece.entryForm === 'PLAIN_LOG';
  const isEscalated  = !!piece.escalatedAt && piece.approverType === 'LEAD';
  const isPmNoLead   = piece.approverType === 'PM' && !piece.escalatedAt;
  const total        = totalHours(piece);
  const overtime     = total > 8;

  const hasExpandable = piece.logNotes || piece.nextDayPlan || piece.remarks;
  const decidedNote   = piece.actedAt && (tab === 'approved' || tab === 'rejected')
    ? `Decided ${fmtRelative(piece.actedAt)}`
    : null;

  const rowBg = isEscalated
    ? 'linear-gradient(90deg, color-mix(in srgb, var(--warn) 7%, transparent), transparent 45%)'
    : 'transparent';

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: rowBg }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 16px' }}>
        {/* Avatar */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        }}>
          {initials(piece.employeeName)}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>{piece.employeeName}</span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{piece.employeeCode}</span>
            {piece.status === 'APPROVED' && (tab === 'approved') && <Chip tone="ok">Approved</Chip>}
            {piece.status === 'REJECTED' && (tab === 'rejected') && <Chip tone="risk">Rejected</Chip>}
            {isEscalated && (
              <span title={piece.approverName ? `${piece.approverName} hasn't acted within SLA.` : 'Team Lead inactive past SLA.'}>
                <Chip tone="warn">
                  <AlertTriangle size={11} aria-hidden="true" /> Escalated · TL inactive {fmtInactivity(piece.hoursPending)}
                </Chip>
              </span>
            )}
            {isPmNoLead && (
              <Chip tone="neutral" dashed>No team lead assigned</Chip>
            )}
          </div>

          {/* Meta row */}
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{fmtDate(piece.entryDate)}</span>
            {piece.projectName && <><span>·</span><span>{piece.projectName}</span></>}
            {piece.approverType === 'LEAD' && piece.approverName && (
              <><span>·</span><span>Lead: {piece.approverName}</span></>
            )}
            <span>·</span>
            <span>Submitted {fmtRelative(piece.frozenAt)}</span>
            {decidedNote && <><span>·</span><span>{decidedNote}</span></>}
          </div>

          {/* Task table (PROJECT_GROUPED) */}
          {!isPlainLog && (
            <div style={{ marginTop: 6 }}>
              <TaskLinesTable taskLines={piece.taskLines} compact />
            </div>
          )}

          {/* Log lines (PLAIN_LOG) — V110+ rows or legacy summary fallback */}
          {isPlainLog && (
            <div style={{ marginTop: 6 }}>
              <LogLinesTable piece={piece} compact />
            </div>
          )}

          {/* Bottom chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
            <Chip tone={overtime ? 'warn' : 'neutral'}>{fmtHours(total)} logged</Chip>
            {overtime && <Chip tone="warn" dashed>Overtime +{fmtHours(total - 8)}</Chip>}
            {dayTypeLabel(piece.dayType) && <Chip tone="neutral" dashed>{dayTypeLabel(piece.dayType)}</Chip>}
            {piece.workLocation && piece.workLocation !== 'OFFICE' && (
              <Chip tone="neutral" dashed>{piece.workLocation === 'HOME' ? 'WFH' : piece.workLocation}</Chip>
            )}
          </div>

          {/* Rejection comment (decided tab) */}
          {piece.comment && tab === 'rejected' && (
            <div style={{
              marginTop: 7, padding: '6px 10px', borderRadius: 6,
              background: 'rgba(228,55,61,.07)', border: '1px solid rgba(228,55,61,.2)',
              fontSize: 12, color: 'var(--risk)',
            }}>
              <span style={{ fontWeight: 600 }}>Rejection reason: </span>{piece.comment}
            </div>
          )}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onOpenModal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              padding: '6px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: (tab === 'pending' || tab === 'escalated') ? 'var(--brand)' : 'var(--raised2)',
              border: `1px solid ${(tab === 'pending' || tab === 'escalated') ? 'var(--brand)' : 'var(--line2)'}`,
              color: (tab === 'pending' || tab === 'escalated') ? '#fff' : 'var(--txt-dim)',
              cursor: 'pointer',
            }}
          >
            Review
          </button>
          {hasExpandable && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            >
              <span style={{ fontSize: 12, fontWeight: 600 }}>Log details</span>
              {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded log notes */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 16px 12px', background: 'var(--raised)' }}>
          {piece.logNotes    && <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginBottom: 4 }}><span style={{ fontWeight: 600, color: 'var(--txt)' }}>Notes: </span>{piece.logNotes}</div>}
          {piece.nextDayPlan && <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}><span style={{ fontWeight: 600, color: 'var(--txt)' }}>Tomorrow: </span>{piece.nextDayPlan}</div>}
          {piece.remarks     && <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginTop: 4 }}><span style={{ fontWeight: 600, color: 'var(--txt)' }}>Remarks: </span>{piece.remarks}</div>}
        </div>
      )}
    </div>
  );
}

// ── ApprovalsPage ─────────────────────────────────────────────────────────────

export type ApprovalsTab = 'pending' | 'escalated' | 'approved' | 'rejected';
type SortMode = 'oldest' | 'latest' | 'hours' | 'name';

const PAGE_SIZE = 10;

export interface ApprovalsPageProps {
  title: string;
  subtitle: string;
  /** All pending pieces from the data source. Split into escalated/plain tabs here. */
  pendingPieces: ApprovalPieceDto[] | undefined;
  decidedApproved: ApprovalPieceDto[] | undefined;
  decidedRejected: ApprovalPieceDto[] | undefined;
  pendingLoading: boolean;
  approvedLoading: boolean;
  rejectedLoading: boolean;
  pendingError: boolean;
  onRefetch: () => void;
  onApprove: (pieceId: number, comment?: string) => Promise<unknown>;
  onReject: (pieceId: number, comment: string) => Promise<unknown>;
  approveBusy: boolean;
  rejectBusy: boolean;
  /** Ordered list of tabs to show. */
  tabs: ApprovalsTab[];
  /** Show Team Lead filter dropdown (PM Approvals). */
  showTlFilter?: boolean;
  /** Show Project and Category filter dropdowns (PM Approvals). */
  showProjectFilter?: boolean;
}

export default function ApprovalsPage({
  title, subtitle,
  pendingPieces, decidedApproved, decidedRejected,
  pendingLoading, approvedLoading, rejectedLoading,
  pendingError, onRefetch,
  onApprove, onReject, approveBusy, rejectBusy,
  tabs, showTlFilter, showProjectFilter,
}: ApprovalsPageProps) {
  const { show } = useToast();

  const [tab, setTab]                   = useState<ApprovalsTab>(tabs[0]);
  const [search, setSearch]             = useState('');
  const [sort, setSort]                 = useState<SortMode>('oldest');
  const [tlFilter, setTlFilter]         = useState<Set<string>>(new Set());
  const [employeeFilter, setEmployeeFilter] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter]   = useState<Set<string>>(new Set());
  const [modalPieceId, setModalPieceId] = useState<number | null>(null);
  const [page, setPage]                 = useState(1);

  // When 'pending' is not in the tab list (PM Approvals), all pending pieces go to the
  // 'escalated' bucket. When 'pending' is present (RM Approvals), split normally.
  const hasPendingTab = tabs.includes('pending');
  const [escalatedPieces, plainPendingPieces] = useMemo(() => {
    const { escalated, plain } = splitPendingPieces(pendingPieces ?? [], hasPendingTab);
    return [escalated, plain];
  }, [pendingPieces, hasPendingTab]);

  const baseList: ApprovalPieceDto[] = useMemo(() => {
    if (tab === 'pending')   return plainPendingPieces;
    if (tab === 'escalated') return escalatedPieces;
    if (tab === 'approved')  return decidedApproved ?? [];
    return decidedRejected ?? [];
  }, [tab, plainPendingPieces, escalatedPieces, decidedApproved, decidedRejected]);

  const allTls = useMemo(
    () => [...new Set(baseList.map(p => p.approverName ?? 'No Team Lead'))].sort(),
    [baseList],
  );
  const allProjects = useMemo(
    () => [...new Set(baseList.map(p => p.projectName).filter(Boolean) as string[])].sort(),
    [baseList],
  );
  const employeeNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of baseList) m.set(p.employeeCode, p.employeeName);
    return m;
  }, [baseList]);
  const allEmployeeCodes = useMemo(
    () => [...employeeNameByCode.keys()].sort((a, b) => (employeeNameByCode.get(a)!).localeCompare(employeeNameByCode.get(b)!)),
    [employeeNameByCode],
  );

  const visible = useMemo(() => {
    let list = baseList;
    if (showTlFilter && tlFilter.size)         list = list.filter(p => tlFilter.has(p.approverName ?? 'No Team Lead'));
    if (employeeFilter.size)                   list = list.filter(p => employeeFilter.has(p.employeeCode));
    if (showProjectFilter && projectFilter.size) list = list.filter(p => p.projectName != null && projectFilter.has(p.projectName));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(p => p.employeeName.toLowerCase().includes(q) || p.employeeCode.toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === 'hours')  sorted.sort((a, b) => totalHours(b) - totalHours(a));
    else if (sort === 'name')   sorted.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    else if (sort === 'latest') sorted.sort((a, b) => (b.frozenAt ?? '').localeCompare(a.frozenAt ?? ''));
    else                        sorted.sort((a, b) => (a.frozenAt ?? '').localeCompare(b.frozenAt ?? ''));
    return sorted;
  }, [baseList, showTlFilter, tlFilter, employeeFilter, showProjectFilter, projectFilter, search, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages);
  const paged      = visible.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const modalPiece = useMemo(
    () => [...(pendingPieces ?? []), ...(decidedApproved ?? []), ...(decidedRejected ?? [])].find(p => p.id === modalPieceId) ?? null,
    [pendingPieces, decidedApproved, decidedRejected, modalPieceId],
  );

  const isLoading = pendingLoading
    || (tab === 'approved' && approvedLoading)
    || (tab === 'rejected' && rejectedLoading);

  const hasActiveFilters = tlFilter.size > 0 || employeeFilter.size > 0 || projectFilter.size > 0;

  function clearAllFilters() { setTlFilter(new Set()); setEmployeeFilter(new Set()); setProjectFilter(new Set()); }
  function switchTab(t: ApprovalsTab) { setTab(t); setPage(1); }

  async function handleApprove(pieceId: number) {
    try {
      await onApprove(pieceId);
      show('Approved.', 'success');
      setModalPieceId(null);
    } catch (err) {
      show(extractError(err), 'error');
      throw err;
    }
  }

  async function handleReject(pieceId: number, comment: string) {
    try {
      await onReject(pieceId, comment);
      show('Rejected.', 'success');
      setModalPieceId(null);
    } catch (err) {
      show(extractError(err), 'error');
      throw err;
    }
  }

  function tabCount(t: ApprovalsTab): number {
    if (t === 'pending')   return plainPendingPieces.length;
    if (t === 'escalated') return escalatedPieces.length;
    if (t === 'approved')  return decidedApproved?.length ?? 0;
    return decidedRejected?.length ?? 0;
  }

  function tabLabel(t: ApprovalsTab): string {
    if (t === 'pending')   return 'Pending';
    if (t === 'escalated') return '⚠ Escalated';
    if (t === 'approved')  return 'Approved';
    return 'Rejected';
  }

  function emptyHeading(t: ApprovalsTab): string {
    if (t === 'pending')   return 'No pending entries';
    if (t === 'escalated') return 'No escalated entries';
    if (t === 'approved')  return 'No approved entries yet';
    return 'No rejected entries';
  }

  function emptyBody(t: ApprovalsTab): string {
    if (t === 'pending')   return 'No entries are waiting on your action.';
    if (t === 'escalated') return hasPendingTab
      ? 'All Team Leads are acting within SLA. Nothing escalated to you.'
      : 'No project pieces awaiting your decision.';
    if (t === 'approved')  return 'Entries you approve will appear here.';
    return 'Entries you reject will appear here with the reason given.';
  }

  if (pendingError) {
    return (
      <div>
        <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 20px' }}>{title}</h1>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load approvals.</div>
          <button onClick={onRefetch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            {title}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>{subtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => switchTab(t)} style={{
            padding: '8px 15px', borderRadius: 20,
            border: `1px solid ${tab === t ? 'var(--brand)' : 'var(--line2)'}`,
            background: tab === t ? 'var(--brand)' : 'var(--raised2)',
            color: tab === t ? '#fff' : 'var(--txt-dim)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {tabLabel(t)}
            <span style={{ background: tab === t ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)', padding: '1px 7px', borderRadius: 20, fontSize: 11.5 }}>
              {tabCount(t)}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="nf-r-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 12px', marginRight: 14 }}>
          <Search size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12.5, width: '100%' }}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {showTlFilter && (
            <FilterDropdown
              label="Team Lead"
              options={allTls}
              selected={tlFilter}
              onToggle={v => toggleFilterVal(tlFilter, setTlFilter, v)}
              onClear={() => setTlFilter(new Set())}
            />
          )}
          <FilterDropdown
            label="Employee"
            options={allEmployeeCodes}
            selected={employeeFilter}
            onToggle={v => toggleFilterVal(employeeFilter, setEmployeeFilter, v)}
            onClear={() => setEmployeeFilter(new Set())}
            getLabel={code => employeeNameByCode.get(code) ?? code}
          />
          {showProjectFilter && (
            <FilterDropdown
              label="Project"
              options={allProjects}
              selected={projectFilter}
              onToggle={v => toggleFilterVal(projectFilter, setProjectFilter, v)}
              onClear={() => setProjectFilter(new Set())}
            />
          )}
          {hasActiveFilters && (
            <button onClick={clearAllFilters} style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 12px' }}>
              Clear all filters
            </button>
          )}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={{ background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
          <option value="oldest">Sort: Oldest first</option>
          <option value="latest">Sort: Latest first</option>
          <option value="hours">Sort: Most hours</option>
          <option value="name">Sort: Employee A–Z</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <Card>
          <GlobalLoader fullScreen={false} compact label="Loading approvals…" />
        </Card>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <CheckCheck size={28} style={{ color: 'var(--ok)', marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>{emptyHeading(tab)}</div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>{emptyBody(tab)}</div>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {paged.map(piece => (
            <PieceCard
              key={piece.id}
              piece={piece}
              tab={tab}
              onOpenModal={() => setModalPieceId(piece.id)}
            />
          ))}
          <Pagination
            page={pageSafe} totalPages={totalPages} totalItems={visible.length} pageSize={PAGE_SIZE}
            onPageChange={setPage} itemLabel="entries"
          />
        </Card>
      )}

      <PieceReviewModal
        piece={modalPiece}
        onClose={() => setModalPieceId(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        approveBusy={approveBusy}
        rejectBusy={rejectBusy}
      />
    </div>
  );
}
