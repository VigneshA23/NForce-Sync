import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, Check, X, RotateCcw, CheckCheck, RefreshCw,
  Search, AlertTriangle, Users, ListFilter,
} from 'lucide-react';
import {
  usePendingApprovals, useDecidedApprovals, useApprovalHistory,
  useApprove, useReject, useRequestChanges, useBatchApprove,
} from '../../api/approvals';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { formatDate as fmtDate, formatDateTime, formatDurationMinutes } from '../../lib/date';
import type { EodEntryDto, EodTaskDto } from '../../api/eod';

// ── helpers ────────────────────────────────────────────────────────────────────

const LEAVE_CATEGORY = 'Leave';

function sumHours(tasks: EodTaskDto[]): number {
  return tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
}

function hrs(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function entryProjects(e: EodEntryDto): string[] {
  return [...new Set(e.tasks.map(t => t.projectCode).filter((p): p is string => !!p))];
}

function entryCategories(e: EodEntryDto): string[] {
  return [...new Set(e.tasks.map(t => t.categoryName).filter((c): c is string => !!c))];
}

/** "Half-day leave 4h" / "Full-day leave 8h" / "Holiday" — same derivation as the TL's Approvals screen. */
function leaveLabel(entry: EodEntryDto): string | null {
  if (entry.dayType === 'HOLIDAY') return 'Holiday';
  if (entry.dayType !== 'LEAVE') return null;
  const leaveHours = sumHours(entry.tasks.filter(t => t.categoryName === LEAVE_CATEGORY));
  const worked = sumHours(entry.tasks.filter(t => t.categoryName !== LEAVE_CATEGORY));
  if (leaveHours <= 0) return null;
  return worked > 0 ? `Half-day leave ${hrs(leaveHours)}h` : `Full-day leave ${hrs(leaveHours)}h`;
}

/** One of late-arrival / early-leave / mid-shift-gap — the schema stores at most one per day. */
function timeAdjustmentLabel(entry: EodEntryDto): string | null {
  const { timeAdjustmentType: type, timeAdjustmentMinutes: mins } = entry;
  if (!type || mins == null || mins <= 0) return null;
  const dur = formatDurationMinutes(mins);
  switch (type) {
    case 'LATE_ARRIVAL': return `${dur} late start`;
    case 'EARLY_LEAVE':  return `${dur} early log-off`;
    case 'INTERVENING':  return `${dur} away mid-shift`;
    default:             return `${dur} time adjustment`;
  }
}

function formatInactivity(hoursSince: number | null | undefined): string {
  if (hoursSince == null) return '';
  if (hoursSince >= 24) return `${Math.floor(hoursSince / 24)}d`;
  return `${hoursSince}h`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Something went wrong';
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ── primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function Btn({
  children, onClick, variant = 'default', disabled = false, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'warn' | 'primary';
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const bg = { default: 'var(--raised2)', danger: 'var(--raised2)', warn: 'var(--raised2)', primary: 'var(--brand)' }[variant];
  const border = { default: 'var(--line2)', danger: 'rgba(228,55,61,.4)', warn: 'rgba(224,169,59,.4)', primary: 'var(--brand)' }[variant];
  const color = { default: 'var(--txt)', danger: 'var(--risk)', warn: 'var(--warn)', primary: '#fff' }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
        border: `1px solid ${border}`, background: bg, color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.14s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ children, tone = 'neutral', dashed = false }: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'info' | 'ok' | 'risk';
  dashed?: boolean;
}) {
  const color = { neutral: 'var(--txt-dim)', warn: 'var(--warn)', info: 'var(--info)', ok: 'var(--ok)', risk: 'var(--risk)' }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color,
      background: dashed ? 'transparent' : `color-mix(in srgb, ${color} 14%, transparent)`,
      border: dashed ? `1px dashed var(--line2)` : `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    }}>
      {children}
    </span>
  );
}

// ── filter dropdown (project / category / billable) ────────────────────────────

function FilterDropdown({ label, options, selected, onToggle, onClear }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          background: selected.size ? 'color-mix(in srgb, var(--brand) 10%, var(--raised2))' : 'var(--raised2)',
          border: `1px solid ${selected.size ? 'rgba(177,17,22,.5)' : 'var(--line2)'}`,
          color: 'var(--txt)', cursor: 'pointer',
        }}
      >
        <ListFilter size={13} aria-hidden="true" />
        {label} {selected.size > 0 && `(${selected.size})`}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 210,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)', maxHeight: 260, overflowY: 'auto',
          }}>
            {selected.size > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button
                  onClick={onClear}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-bright)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '4px' }}
                >
                  Clear all
                </button>
              </div>
            )}
            {options.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--txt-dim)', padding: '6px 4px' }}>No options</div>
            )}
            {options.map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--txt)', padding: '5px 4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} style={{ accentColor: 'var(--brand-bright)' }} />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── action panel (approve / reject / request changes) ──────────────────────────

interface ActionPanelProps {
  type: 'approve' | 'reject' | 'request-changes' | null;
  entryId: number;
  onClose: () => void;
}

function ActionPanel({ type, entryId, onClose }: ActionPanelProps) {
  const [comment, setComment] = useState('');
  const [billableOverride, setBillable] = useState<boolean | undefined>(undefined);
  const { show } = useToast();

  const approve = useApprove();
  const reject = useReject();
  const requestChanges = useRequestChanges();

  if (!type) return null;
  const busy = approve.isPending || reject.isPending || requestChanges.isPending;

  async function submit() {
    try {
      if (type === 'approve') {
        await approve.mutateAsync({ entryId, billableOverride, comment: comment || undefined });
        show('Entry approved. Utilization recomputed.', 'success');
      } else if (type === 'reject') {
        if (!comment.trim()) return;
        await reject.mutateAsync({ entryId, comment });
        show('Entry rejected — reason sent to employee & TL.', 'success');
      } else {
        if (!comment.trim()) return;
        await requestChanges.mutateAsync({ entryId, comment });
        show('Changes requested.', 'success');
      }
      onClose();
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  const needsComment = type !== 'approve';
  const commentEmpty = needsComment && !comment.trim();

  return (
    <div style={{ background: 'var(--raised)', borderTop: '1px solid var(--line)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {type === 'approve' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--txt-mut)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={billableOverride === true}
            onChange={e => setBillable(e.target.checked ? true : undefined)}
            style={{ accentColor: 'var(--brand-bright)' }}
          />
          Override all tasks as billable
        </label>
      )}
      {needsComment && (
        <textarea
          rows={2}
          placeholder={type === 'reject' ? 'Rejection reason — shared with the employee and their TL (required)' : 'Comment for changes needed (required)'}
          value={comment}
          onChange={e => setComment(e.target.value)}
          style={{
            width: '100%', resize: 'vertical', padding: '8px 10px',
            background: 'var(--panel)', border: `1px solid ${commentEmpty ? 'var(--risk)' : 'var(--line2)'}`,
            borderRadius: 6, color: 'var(--txt)', fontSize: 12, fontFamily: '"Inter", sans-serif',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant={type === 'approve' ? 'primary' : type === 'reject' ? 'danger' : 'warn'} onClick={submit} disabled={busy || commentEmpty}>
          {busy ? 'Saving…' : type === 'approve' ? 'Confirm Approve' : type === 'reject' ? 'Confirm Reject' : 'Request Changes'}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
}

// ── audit trail (submitted → actions → escalated) ───────────────────────────────

function AuditTrail({ entry }: { entry: EodEntryDto }) {
  const { data: actions, isPending } = useApprovalHistory(entry.id, true);

  if (isPending) return <div style={{ padding: '12px 16px' }}><Skel h={12} w="60%" /></div>;

  const actionLabel: Record<string, string> = {
    APPROVE: 'Approved',
    REJECT: 'Rejected',
    REQUEST_CHANGES: 'Changes requested',
  };

  return (
    <div style={{ padding: '12px 16px 16px', background: 'var(--raised)', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.06em', color: 'var(--txt-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
        Submission history
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: '2px solid var(--line)', maxWidth: 520 }}>
        {entry.submittedAt && (
          <li style={{ position: 'relative', padding: '0 0 12px 16px', fontSize: 12.5, color: 'var(--txt-mut)' }}>
            <span style={{ position: 'absolute', left: -5, top: 3, width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-bright)', border: '2px solid var(--raised)' }} />
            <b style={{ color: 'var(--txt)' }}>Submitted</b>
            <span style={{ display: 'block', color: 'var(--txt-dim)', fontSize: 11 }}>{formatDateTime(entry.submittedAt)}</span>
          </li>
        )}
        {(actions ?? []).map(a => (
          <li key={a.id} style={{ position: 'relative', padding: '0 0 12px 16px', fontSize: 12.5, color: 'var(--txt-mut)' }}>
            <span style={{ position: 'absolute', left: -5, top: 3, width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-bright)', border: '2px solid var(--raised)' }} />
            <b style={{ color: 'var(--txt)' }}>{actionLabel[a.action] ?? a.action} by {a.actorName}</b>
            <span style={{ display: 'block', color: 'var(--txt-dim)', fontSize: 11 }}>{formatDateTime(a.actedAt)}</span>
          </li>
        ))}
        {entry.escalated && (
          <li style={{ position: 'relative', padding: '0 0 0 16px', fontSize: 12.5, color: 'var(--txt-mut)' }}>
            <span style={{ position: 'absolute', left: -5, top: 3, width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', border: '2px solid var(--raised)' }} />
            <b style={{ color: 'var(--warn)' }}>Escalated to you</b>
            <span style={{ display: 'block', color: 'var(--txt-dim)', fontSize: 11 }}>
              {entry.tlName ? `${entry.tlName} hasn't acted in ${formatInactivity(entry.tlInactivityHours)}` : 'No Team Lead assigned'}
            </span>
          </li>
        )}
      </ul>
      {entry.reviewerComment && (
        <div style={{ background: 'color-mix(in srgb, var(--risk) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--risk) 30%, transparent)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--txt)', marginTop: 10, maxWidth: 520 }}>
          <strong>{entry.status === 'CHANGES_REQUESTED' ? 'Changes requested: ' : 'Previous reject reason: '}</strong>{entry.reviewerComment}
        </div>
      )}
    </div>
  );
}

// ── entry row ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry, actionable, checked, onToggleCheck,
  expanded, onToggleExpand, onOpenReject,
}: {
  entry: EodEntryDto;
  actionable: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenReject: () => void;
}) {
  const [action, setAction] = useState<'approve' | 'reject' | 'request-changes' | null>(null);
  const total = sumHours(entry.tasks);
  const overtime = entry.isOvertime && entry.overtimeHours != null ? Number(entry.overtimeHours) : 0;
  const undertime = entry.undertimeHours != null ? Number(entry.undertimeHours) : 0;
  const projects = entryProjects(entry);
  const padding = '9px 16px';

  function openAction(a: typeof action) {
    if (a === 'reject') { onOpenReject(); return; }
    setAction(prev => prev === a ? null : a);
  }

  const statusChip = entry.status === 'APPROVED'
    ? <Chip tone="ok">Approved</Chip>
    : entry.status === 'REJECTED'
      ? <Chip tone="risk">Rejected</Chip>
      : entry.status === 'CHANGES_REQUESTED'
        ? <Chip tone="warn">Changes requested</Chip>
        : null;

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: entry.escalated ? 'linear-gradient(90deg, color-mix(in srgb, var(--warn) 7%, transparent), transparent 45%)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding }}>
        {actionable && (
          <div style={{ marginTop: 2 }}>
            <input type="checkbox" checked={checked} onChange={onToggleCheck} style={{ width: 15, height: 15, accentColor: 'var(--brand-bright)', cursor: 'pointer' }} />
          </div>
        )}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
          background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        }}>
          {initials(entry.employeeName)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>{entry.employeeName}</span>
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>{entry.employeeCode}</span>
            {entry.escalated && (
              <span title={entry.tlName ? `${entry.tlName} hasn't reviewed since this was submitted.` : 'No Team Lead assigned.'}>
                <Chip tone="warn"><AlertTriangle size={11} aria-hidden="true" /> Escalated · TL inactive {formatInactivity(entry.tlInactivityHours)}</Chip>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{fmtDate(entry.entryDate)}</span>
            <span>·</span>
            <span>Submitted {formatRelative(entry.submittedAt)}</span>
            <span>·</span>
            <span>{entry.tasks.length} task{entry.tasks.length !== 1 ? 's' : ''} · {projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          </div>

          {entry.tasks.length > 0 && (
            <div style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'rgba(255,255,255,.02)' }}>
              {entry.tasks.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '4px 11px',
                  fontSize: 11, color: 'var(--txt-dim)',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <span style={{ color: 'var(--txt)', fontWeight: 600, minWidth: 120, flexShrink: 0 }}>{t.projectCode ?? '—'}</span>
                  <span style={{ flex: 1 }}>{t.categoryName ?? '—'}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.isBillable ? 'var(--ok)' : 'transparent', border: t.isBillable ? 'none' : '1.5px solid var(--txt-dim)', flexShrink: 0 }} title={t.isBillable ? 'Billable' : 'Non-billable'} />
                  <span style={{ color: 'var(--txt)', fontWeight: 700, minWidth: 36, textAlign: 'right', flexShrink: 0 }}>{t.hours != null ? `${hrs(Number(t.hours))}h` : '—'}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
            <Chip tone="neutral">{hrs(total)}h total</Chip>
            {statusChip}
            {overtime > 0 && <Chip tone="warn">OT +{hrs(overtime)}h</Chip>}
            {undertime > 0 && <Chip tone="info">Under −{hrs(undertime)}h</Chip>}
            {timeAdjustmentLabel(entry) && <Chip tone="neutral" dashed>{timeAdjustmentLabel(entry)}</Chip>}
            {leaveLabel(entry) && <Chip tone="neutral" dashed>{leaveLabel(entry)}</Chip>}
            {entry.isResubmission && <Chip tone="neutral" dashed>Resubmitted after rejection</Chip>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          {actionable ? (
            <div style={{ display: 'flex', gap: 7 }}>
              <Btn onClick={() => openAction('request-changes')}><RotateCcw size={12} aria-hidden="true" /> Changes</Btn>
              <Btn variant="danger" onClick={() => openAction('reject')}><X size={12} aria-hidden="true" /> Reject</Btn>
              <Btn variant="primary" onClick={() => openAction('approve')}><Check size={12} aria-hidden="true" /> Approve</Btn>
            </div>
          ) : null}
          <button
            onClick={onToggleExpand}
            title="View audit trail"
            style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {action && <ActionPanel type={action} entryId={entry.id} onClose={() => setAction(null)} />}
      {expanded && <AuditTrail entry={entry} />}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'escalated' | 'approved' | 'rejected' | 'changes-requested';
type SortMode = 'oldest' | 'latest' | 'hours' | 'name';

function groupByTL(entries: EodEntryDto[]): Map<string, EodEntryDto[]> {
  const map = new Map<string, EodEntryDto[]>();
  for (const e of entries) {
    const key = e.tlName ?? 'No Team Lead assigned';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

export default function ApprovalsPM() {
  const { data: pending, isPending: pendingLoading, isError: pendingError, refetch } = usePendingApprovals();
  const { data: approved, isPending: approvedLoading } = useDecidedApprovals('APPROVED');
  const { data: rejected, isPending: rejectedLoading } = useDecidedApprovals('REJECTED');
  const { data: changesRequested, isPending: changesRequestedLoading } = useDecidedApprovals('CHANGES_REQUESTED');
  const batchApprove = useBatchApprove();
  const reject = useReject();
  const { show } = useToast();

  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [billableFilter, setBillableFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<'bulk' | number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);

  const isLoading = pendingLoading
    || (tab === 'approved' && approvedLoading)
    || (tab === 'rejected' && rejectedLoading)
    || (tab === 'changes-requested' && changesRequestedLoading);

  const baseList: EodEntryDto[] = useMemo(() => {
    if (tab === 'pending') return pending ?? [];
    if (tab === 'escalated') return (pending ?? []).filter(e => e.escalated);
    if (tab === 'approved') return approved ?? [];
    if (tab === 'rejected') return rejected ?? [];
    return changesRequested ?? [];
  }, [tab, pending, approved, rejected, changesRequested]);

  const allProjects = useMemo(() => [...new Set(baseList.flatMap(entryProjects))].sort(), [baseList]);
  const allCategories = useMemo(() => [...new Set(baseList.flatMap(entryCategories))].sort(), [baseList]);

  const visible = useMemo(() => {
    let list = baseList;
    if (projectFilter.size) list = list.filter(e => entryProjects(e).some(p => projectFilter.has(p)));
    if (categoryFilter.size) list = list.filter(e => entryCategories(e).some(c => categoryFilter.has(c)));
    if (billableFilter.size) {
      list = list.filter(e => {
        const labels = new Set<string>(e.tasks.map(t => t.isBillable ? 'Billable' : 'Non-billable'));
        return [...billableFilter].some(f => labels.has(f));
      });
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(e => e.employeeName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q));

    const sorted = [...list];
    if (sort === 'hours') sorted.sort((a, b) => sumHours(b.tasks) - sumHours(a.tasks));
    else if (sort === 'name') sorted.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    else if (sort === 'latest') sorted.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
    else sorted.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
    return sorted;
  }, [baseList, projectFilter, categoryFilter, billableFilter, search, sort]);

  const grouped = useMemo(() => groupByTL(visible), [visible]);
  const actionable = tab === 'pending' || tab === 'escalated';

  const pendingCount = pending?.length ?? 0;
  const escalatedCount = (pending ?? []).filter(e => e.escalated).length;
  const approvedCount = approved?.length ?? 0;
  const rejectedCount = rejected?.length ?? 0;
  const changesRequestedCount = changesRequested?.length ?? 0;

  function toggleFilterVal(set: Set<string>, setFn: (s: Set<string>) => void, val: string) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setFn(next);
  }

  const hasActiveFilters = projectFilter.size > 0 || categoryFilter.size > 0 || billableFilter.size > 0;

  function clearAllFilters() {
    setProjectFilter(new Set());
    setCategoryFilter(new Set());
    setBillableFilter(new Set());
  }

  function toggleCheck(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleExpand(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setSelected(new Set());
  }

  async function approveIds(ids: number[]) {
    if (ids.length === 0) return;
    try {
      await batchApprove.mutateAsync(ids);
      show(`${ids.length} entr${ids.length !== 1 ? 'ies' : 'y'} approved. Utilization recomputed.`, 'success');
      setSelected(new Set());
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  async function confirmRejectSubmit() {
    const reason = rejectReason.trim();
    if (!reason) return;
    const ids = rejectTarget === 'bulk' ? [...selected] : rejectTarget != null ? [rejectTarget] : [];
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map(id => reject.mutateAsync({ entryId: id, comment: reason })));
    const failed = results.filter(r => r.status === 'rejected').length;
    const succeeded = ids.length - failed;
    if (failed === 0) show(`${succeeded} entr${succeeded !== 1 ? 'ies' : 'y'} rejected — reason sent to employee & TL.`, 'success');
    else show(`${succeeded} of ${ids.length} rejected, ${failed} failed — please retry the rest.`, 'error');
    setSelected(new Set());
    setRejectTarget(null);
    setRejectReason('');
  }

  const approveAllProjects = [...new Set(visible.flatMap(entryProjects))];
  const approveAllEscalated = visible.filter(e => e.escalated).length;

  if (pendingError) {
    return (
      <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load pending entries.</div>
        <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </Card>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Approvals
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>Review and act on your projects' EOD submissions</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {actionable && visible.length > 0 && (
            <button
              onClick={() => setConfirmApproveAll(true)}
              disabled={batchApprove.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7,
                fontSize: 13, fontWeight: 500, background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                cursor: batchApprove.isPending ? 'not-allowed' : 'pointer', opacity: batchApprove.isPending ? 0.6 : 1,
              }}
            >
              <CheckCheck size={14} aria-hidden="true" /> Approve all ({visible.length})
            </button>
          )}
        </div>
      </div>

      {/* Escalation banner */}
      {escalatedCount > 0 && tab !== 'escalated' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
          background: 'color-mix(in srgb, var(--warn) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
          borderRadius: 12, padding: '13px 18px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={18} style={{ color: 'var(--warn)' }} aria-hidden="true" />
            <div style={{ fontSize: 13, color: 'var(--txt)' }}>
              <strong>{escalatedCount} entr{escalatedCount !== 1 ? 'ies' : 'y'}</strong> need your review — assigned Team Lead hasn't responded within SLA.
            </div>
          </div>
          <Btn variant="warn" onClick={() => switchTab('escalated')}>Review now →</Btn>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['pending', 'Pending', pendingCount],
          ['escalated', '⚠ Escalated', escalatedCount],
          ['approved', 'Approved', approvedCount],
          ['rejected', 'Rejected', rejectedCount],
          ['changes-requested', 'Changes Requested', changesRequestedCount],
        ] as [Tab, string, number][]).map(([key, label, count]) => (
          <button key={key} onClick={() => switchTab(key)} style={{
            padding: '8px 15px', borderRadius: 20, border: `1px solid ${tab === key ? 'var(--brand)' : 'var(--line2)'}`,
            background: tab === key ? 'var(--brand)' : 'var(--raised2)', color: tab === key ? '#fff' : 'var(--txt-dim)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            {label}
            <span style={{ background: tab === key ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.1)', padding: '1px 7px', borderRadius: 20, fontSize: 11.5 }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 12px', marginRight: 14 }}>
          <Search size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12.5, width: '100%' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterDropdown label="Project" options={allProjects} selected={projectFilter} onToggle={v => toggleFilterVal(projectFilter, setProjectFilter, v)} onClear={() => setProjectFilter(new Set())} />
          <FilterDropdown label="Category" options={allCategories} selected={categoryFilter} onToggle={v => toggleFilterVal(categoryFilter, setCategoryFilter, v)} onClear={() => setCategoryFilter(new Set())} />
          <FilterDropdown label="Billable" options={['Billable', 'Non-billable']} selected={billableFilter} onToggle={v => toggleFilterVal(billableFilter, setBillableFilter, v)} onClear={() => setBillableFilter(new Set())} />
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 12px' }}
            >
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

      {/* Bulk bar */}
      {actionable && selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: 'var(--raised)', border: '1px solid rgba(177,17,22,.4)', borderRadius: 12,
          padding: '10px 16px', marginBottom: 14, position: 'sticky', top: 10, zIndex: 15,
        }}>
          <span style={{ fontSize: 13, color: 'var(--txt)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => setSelected(new Set())}>Clear</Btn>
            <Btn variant="danger" onClick={() => { setRejectTarget('bulk'); setRejectReason(''); }}><X size={12} aria-hidden="true" /> Reject selected</Btn>
            <Btn variant="primary" onClick={() => approveIds([...selected])} disabled={batchApprove.isPending}><Check size={12} aria-hidden="true" /> Approve selected</Btn>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <Card>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: 16, borderBottom: '1px solid var(--line)', display: 'flex', gap: 12 }}>
              <Skel h={14} w="30%" /><Skel h={14} w="20%" /><Skel h={14} w="15%" />
            </div>
          ))}
        </Card>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <CheckCheck size={28} style={{ color: 'var(--ok)', marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>
            {tab === 'pending' && "You're all caught up"}
            {tab === 'escalated' && 'No escalated entries'}
            {tab === 'approved' && 'No approved entries yet'}
            {tab === 'rejected' && 'No rejected entries'}
            {tab === 'changes-requested' && 'No changes-requested entries'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
            {tab === 'pending' && 'No pending entries match your current filters.'}
            {tab === 'escalated' && 'All Team Leads are current — nothing has breached SLA.'}
            {tab === 'approved' && 'Entries you approve will appear here.'}
            {tab === 'rejected' && 'Entries you reject will appear here with the reason given.'}
            {tab === 'changes-requested' && 'Entries you send back for changes will appear here.'}
          </div>
        </Card>
      ) : (
        <>
          {[...grouped.entries()].map(([tlName, rows]) => {
            const escInGroup = rows.filter(e => e.escalated).length;
            return (
              <Card key={tlName} style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'var(--raised)', borderBottom: '1px solid var(--line)' }}>
                  <Users size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>{tlName}</span>
                  <span style={{ color: 'var(--txt-dim)', fontSize: 12 }}>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
                  {escInGroup > 0 && <span style={{ marginLeft: 'auto' }}><Chip tone="warn">⚠ {escInGroup} escalated</Chip></span>}
                </div>
                {rows.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    actionable={actionable}
                    checked={selected.has(entry.id)}
                    onToggleCheck={() => toggleCheck(entry.id)}
                    expanded={expanded.has(entry.id)}
                    onToggleExpand={() => toggleExpand(entry.id)}
                    onOpenReject={() => { setRejectTarget(entry.id); setRejectReason(''); }}
                  />
                ))}
              </Card>
            );
          })}
        </>
      )}

      {/* Reject modal */}
      <Modal
        open={rejectTarget != null}
        title="Reject entry"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <Btn onClick={() => setRejectTarget(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={confirmRejectSubmit} disabled={!rejectReason.trim() || reject.isPending}>
              {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
            </Btn>
          </>
        }
      >
        <p style={{ margin: '0 0 12px', color: 'var(--txt-mut)', fontSize: 12.5 }}>This reason is shared with the employee and their Team Lead.</p>
        <textarea
          rows={4}
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="e.g. Missing task description for the overtime hours logged"
          style={{ width: '100%', resize: 'vertical', padding: 10, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--txt)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </Modal>

      {/* Approve-all confirm modal */}
      <Modal
        open={confirmApproveAll}
        title="Approve all visible entries?"
        onClose={() => setConfirmApproveAll(false)}
        footer={
          <>
            <Btn onClick={() => setConfirmApproveAll(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={async () => { setConfirmApproveAll(false); await approveIds(visible.map(e => e.id)); }} disabled={batchApprove.isPending}>
              {batchApprove.isPending ? 'Approving…' : `Approve ${visible.length}`}
            </Btn>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--txt)' }}>
          Approve {visible.length} entr{visible.length !== 1 ? 'ies' : 'y'} across {approveAllProjects.length} project{approveAllProjects.length !== 1 ? 's' : ''}
          {approveAllEscalated > 0 ? `, including ${approveAllEscalated} escalated` : ''}?
        </p>
      </Modal>
    </div>
  );
}
