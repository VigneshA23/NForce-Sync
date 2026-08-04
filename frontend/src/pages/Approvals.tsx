import { useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight, CheckCheck, Check, X, RotateCcw, RefreshCw } from 'lucide-react';
import { usePendingApprovals, useApprove, useReject, useRequestChanges, useBatchApprove } from '../api/approvals';
import { DropdownMenu } from '../components/DropdownMenu';
import { useToast } from '../lib/toast';
import { formatDate as fmtDate, formatDurationMinutes, todayISO, yesterdayISO } from '../lib/date';
import type { EodEntryDto, EodTaskDto } from '../api/eod';

// ── helpers ────────────────────────────────────────────────────────────────────

/** Category name for leave rows — renamed from 'Leave / Holiday' in V35. */
const LEAVE_CATEGORY = 'Leave';

function sumHours(tasks: EodTaskDto[]): number {
  return tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
}

/** Drops a pointless trailing .0 — "4 hrs", not "4.0 hrs". */
function hrs(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * One plain-language summary of the day: leave taken, hours worked, and how much of that was
 * overtime.
 *
 * Overtime is stated as a SPLIT of the hours worked, never as a separate addend. Showing
 * "5 hrs worked" and "Overtime +1.0 hrs" side by side reads as 5 + 1 = 6, when the 1 is already
 * inside the 5 — so it is spelled out as "worked 4 hrs + 1 hr OT = 5 hrs".
 *
 * regular = worked - overtime, which always lands on the day's expected hours: with 4 hrs leave
 * the expected work is 8 - 4 = 4, so logging 5 gives 4 regular + 1 OT.
 *
 * Returns null for an ordinary working day with no overtime — nothing to clarify there.
 */
function daySummary(entry: EodEntryDto): string | null {
  if (entry.dayType === 'HOLIDAY') return 'Holiday — no tasks';

  const leaveHours = sumHours(entry.tasks.filter(t => t.categoryName === LEAVE_CATEGORY));
  const worked     = sumHours(entry.tasks.filter(t => t.categoryName !== LEAVE_CATEGORY));
  const overtime   = entry.isOvertime && entry.overtimeHours != null
    ? Number(entry.overtimeHours)
    : 0;

  const parts: string[] = [];
  if (entry.dayType === 'LEAVE' && leaveHours > 0) {
    parts.push(worked > 0
      ? `Half-day leave ${hrs(leaveHours)} hrs`
      : `Full-day leave ${hrs(leaveHours)} hrs`);
  }

  if (overtime > 0) {
    const regular = Math.max(0, worked - overtime);
    parts.push(`worked ${hrs(regular)} hrs + ${hrs(overtime)} hr${overtime === 1 ? '' : 's'} OT = ${hrs(worked)} hrs total`);
  } else if (parts.length > 0 && worked > 0) {
    parts.push(`worked ${hrs(worked)} hrs`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * A time adjustment in the manager's words — "2 hrs late log-in" rather than
 * "LATE_ARRIVAL / 120". Returns null when the entry has no adjustment.
 */
function timeAdjustmentLabel(entry: EodEntryDto): string | null {
  const { timeAdjustmentType: type, timeAdjustmentMinutes: mins } = entry;
  if (!type || mins == null || mins <= 0) return null;
  const dur = formatDurationMinutes(mins);
  switch (type) {
    case 'LATE_ARRIVAL': return `${dur} late log-in`;
    case 'EARLY_LEAVE':  return `${dur} early log-off`;
    case 'INTERVENING':  return `${dur} away mid-shift`;
    default:             return `${dur} time adjustment`;
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Something went wrong';
}

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

// ── task status badge ──────────────────────────────────────────────────────────

const TASK_STATUS_CFG: Record<string, { color: string; label: string }> = {
  COMPLETED:   { color: 'var(--ok)',      label: 'Done' },
  IN_PROGRESS: { color: 'var(--info)',    label: 'In Progress' },
  BLOCKED:     { color: 'var(--risk)',    label: 'Blocked' },
  NOT_STARTED: { color: 'var(--txt-dim)', label: 'Not Started' },
};

function TaskStatusBadge({ status }: { status: string }) {
  const { color, label } = TASK_STATUS_CFG[status] ?? { color: 'var(--txt-dim)', label: status };
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
    }}>
      {label}
    </span>
  );
}

// ── task breakdown row ─────────────────────────────────────────────────────────

function TaskRow({ task }: { task: EodTaskDto }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '40px 1fr auto auto auto',
      gap: 10, alignItems: 'center',
      padding: '8px 16px',
      borderBottom: '1px solid var(--line)',
      fontSize: 12,
    }}>
      <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)', fontSize: 11 }}>
        {task.hours != null ? `${task.hours}h` : '—'}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.description ?? '—'}
        </div>
        <div style={{ color: 'var(--txt-dim)', fontSize: 11, marginTop: 1 }}>
          {[task.projectCode, task.categoryName].filter(Boolean).join(' · ')}
        </div>
        {task.taskStatus === 'BLOCKED' && task.blockerReason && (
          <div style={{ color: 'var(--risk)', fontSize: 11, marginTop: 2 }}>
            ⚠ {task.blockerReason}
          </div>
        )}
      </div>
      <TaskStatusBadge status={task.taskStatus} />
      <span style={{ fontSize: 10, color: task.isBillable ? 'var(--ok)' : 'var(--txt-dim)', fontWeight: 600 }}>
        {task.isBillable ? 'Billable' : 'Non-billable'}
      </span>
    </div>
  );
}

// ── comment modal (inline, not a separate component) ──────────────────────────

interface ActionPanelProps {
  type: 'approve' | 'reject' | 'request-changes' | null;
  entryId: number;
  onClose: () => void;
}

function ActionPanel({ type, entryId, onClose }: ActionPanelProps) {
  const [comment, setComment]           = useState('');
  const [billableOverride, setBillable] = useState<boolean | undefined>(undefined);
  const { show } = useToast();

  const approve        = useApprove();
  const reject         = useReject();
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
        show('Entry rejected.', 'success');
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
    <div style={{
      background: 'var(--raised)', borderTop: '1px solid var(--line)',
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
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
          placeholder={type === 'reject' ? 'Rejection reason (required)' : 'Comment for changes needed (required)'}
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
        <Btn
          variant={type === 'approve' ? 'primary' : type === 'reject' ? 'danger' : 'warn'}
          onClick={submit}
          disabled={busy || commentEmpty}
        >
          {busy ? 'Saving…' : type === 'approve' ? 'Confirm Approve' : type === 'reject' ? 'Confirm Reject' : 'Request Changes'}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
}

// ── entry row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: EodEntryDto }) {
  const [expanded, setExpanded] = useState(false);
  const [action, setAction]     = useState<'approve' | 'reject' | 'request-changes' | null>(null);

  function openAction(a: typeof action) {
    setAction(prev => prev === a ? null : a);
    setExpanded(true);
  }

  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      {/* Summary row */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 100px 48px', gap: 12, alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => { setExpanded(e => !e); if (action) setAction(null); }}
      >
        <div style={{ color: 'var(--txt-dim)', display: 'flex', alignItems: 'center' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)' }}>
            {(entry as EodEntryDto & { employeeName?: string }).employeeName ?? `Employee #${entry.employeeId}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
            {entry.employeeCode ?? `#${entry.employeeId}`}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
          {fmtDate(entry.entryDate)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
          {formatRelative(entry.submittedAt)} · {entry.tasks.length} task{entry.tasks.length !== 1 ? 's' : ''}
          {/* Day type, time adjustment and overtime are all visible without expanding the row —
              the manager decides from here, and a shortened day changes what "enough hours"
              means. Without these, a 4-hour submission just looks incomplete. */}
          {daySummary(entry) && (
            <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
              {' '}· {daySummary(entry)}
            </span>
          )}
          {timeAdjustmentLabel(entry) && (
            <span style={{ color: 'var(--info)', fontWeight: 600 }}>
              {' '}· {timeAdjustmentLabel(entry)}
            </span>
          )}
        </div>
        {/* Row actions menu — stop propagation so row expand doesn't fire */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <DropdownMenu
            ariaLabel={`Actions for ${(entry as EodEntryDto & { employeeName?: string }).employeeName ?? `Employee #${entry.employeeId}`}`}
            items={[
              { key: 'approve', label: 'Approve', icon: Check, color: 'var(--ok)', onSelect: () => openAction('approve') },
              { key: 'reject', label: 'Reject', icon: X, color: 'var(--risk)', onSelect: () => openAction('reject') },
              { key: 'request-changes', label: 'Request changes', icon: RotateCcw, color: 'var(--warn)', onSelect: () => openAction('request-changes') },
            ]}
          />
        </div>
      </div>

      {/* Task breakdown */}
      {expanded && entry.tasks.length > 0 && (
        <div style={{ background: 'var(--raised)', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto auto auto', gap: 10, padding: '6px 16px', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--line)' }}>
            <span>Hrs</span><span>Task</span><span>Status</span><span>Billing</span>
          </div>
          {entry.tasks.map(t => <TaskRow key={t.id} task={t} />)}
          {entry.remarks && (
            <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--txt-mut)', borderTop: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--txt-dim)', fontWeight: 600 }}>Remarks: </span>
              {entry.remarks}
            </div>
          )}
        </div>
      )}

      {/* Action panel */}
      {action && (
        <ActionPanel
          type={action}
          entryId={entry.id}
          onClose={() => { setAction(null); }}
        />
      )}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

/** Most recent EOD date first; same-date entries ordered by employee name so reloads don't shuffle. */
function sortEntries(list: EodEntryDto[]): EodEntryDto[] {
  return [...list].sort((a, b) =>
    b.entryDate.localeCompare(a.entryDate) || a.employeeName.localeCompare(b.employeeName));
}

type DateMode = 'all' | 'today' | 'yesterday' | 'range';

export default function Approvals() {
  const { data: rawEntries, isPending, isError, refetch } = usePendingApprovals();
  const entries = useMemo(() => rawEntries && sortEntries(rawEntries), [rawEntries]);
  const batchApprove = useBatchApprove();
  const { show } = useToast();

  const [mode, setMode] = useState<DateMode>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(todayISO());
  const [draftTo, setDraftTo] = useState(todayISO());
  const [rangeFrom, setRangeFrom] = useState(todayISO());
  const [rangeTo, setRangeTo] = useState(todayISO());

  const filteredEntries = useMemo(() => {
    if (!entries) return entries;
    if (mode === 'today') return entries.filter(e => e.entryDate === todayISO());
    if (mode === 'yesterday') return entries.filter(e => e.entryDate === yesterdayISO());
    if (mode === 'range') return entries.filter(e => e.entryDate >= rangeFrom && e.entryDate <= rangeTo);
    return entries;
  }, [entries, mode, rangeFrom, rangeTo]);

  function selectQuick(kind: 'all' | 'today' | 'yesterday') {
    setMode(kind);
    setPickerOpen(false);
  }

  function openPicker() {
    setDraftFrom(mode === 'range' ? rangeFrom : todayISO());
    setDraftTo(mode === 'range' ? rangeTo : todayISO());
    setPickerOpen(true);
  }

  function applyRange() {
    if (draftFrom > draftTo) return;
    setRangeFrom(draftFrom);
    setRangeTo(draftTo);
    setMode('range');
    setPickerOpen(false);
  }

  const filterLabel = mode === 'all'
    ? 'All days'
    : mode === 'today'
      ? 'Today'
      : mode === 'yesterday'
        ? 'Yesterday'
        : rangeFrom === rangeTo ? fmtShortDate(rangeFrom) : `${fmtShortDate(rangeFrom)} – ${fmtShortDate(rangeTo)}`;

  async function approveAll() {
    if (!filteredEntries || filteredEntries.length === 0) return;
    try {
      await batchApprove.mutateAsync(filteredEntries.map(e => e.id));
      show(`${filteredEntries.length} entr${filteredEntries.length !== 1 ? 'ies' : 'y'} approved. Utilization recomputed.`, 'success');
    } catch (err) {
      show(extractError(err), 'error');
    }
  }

  if (isPending) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28 }}>
          <div><Skel h={24} w={160} /><div style={{ marginTop: 8 }}><Skel h={14} w={120} /></div></div>
        </div>
        <Card>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: '16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 12 }}>
              <Skel h={14} w="30%" /><Skel h={14} w="20%" /><Skel h={14} w="15%" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Approvals</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load pending entries.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Approvals
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            {filteredEntries!.length} pending entr{filteredEntries!.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', fontSize: 12, fontWeight: 600,
                color: mode !== 'all' ? 'var(--info)' : 'var(--txt)',
                background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Calendar size={13} aria-hidden="true" />
              {filterLabel}
              <ChevronDown size={12} aria-hidden="true" />
            </button>

            {pickerOpen && (
              <>
                <div
                  onClick={() => setPickerOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 19 }}
                />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 260,
                  background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {(['all', 'today', 'yesterday'] as const).map(kind => (
                      <button
                        key={kind}
                        onClick={() => selectQuick(kind)}
                        style={{
                          flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: mode === kind ? 'var(--info)' : 'var(--raised2)',
                          color: mode === kind ? '#fff' : 'var(--txt)',
                          border: '1px solid var(--line2)',
                        }}
                      >
                        {kind === 'all' ? 'All days' : kind === 'today' ? 'Today' : 'Yesterday'}
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Custom range
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <input
                      type="date"
                      value={draftFrom}
                      max={todayISO()}
                      onChange={(e) => setDraftFrom(e.target.value)}
                      style={{
                        flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                        background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>to</span>
                    <input
                      type="date"
                      value={draftTo}
                      max={todayISO()}
                      onChange={(e) => setDraftTo(e.target.value)}
                      style={{
                        flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6,
                        background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)',
                      }}
                    />
                  </div>
                  {draftFrom > draftTo && (
                    <div style={{ fontSize: 11, color: 'var(--risk)', marginBottom: 10 }}>"From" must not be after "to".</div>
                  )}
                  <button
                    onClick={applyRange}
                    disabled={draftFrom > draftTo}
                    style={{
                      width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                      background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                      cursor: draftFrom > draftTo ? 'default' : 'pointer',
                      opacity: draftFrom > draftTo ? 0.6 : 1,
                    }}
                  >
                    Apply
                  </button>
                </div>
              </>
            )}
          </div>

          {filteredEntries!.length > 0 && (
            <button
              onClick={approveAll}
              disabled={batchApprove.isPending}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                cursor: batchApprove.isPending ? 'not-allowed' : 'pointer',
                opacity: batchApprove.isPending ? 0.6 : 1,
              }}
            >
              <CheckCheck size={14} aria-hidden="true" />
              {batchApprove.isPending ? 'Approving…' : `Approve All (${filteredEntries!.length})`}
            </button>
          )}
        </div>
      </div>

      {filteredEntries!.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <CheckCheck size={28} style={{ color: 'var(--ok)', marginBottom: 12 }} aria-hidden="true" />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>All caught up</div>
          <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>No entries pending approval{mode !== 'all' ? ' for this filter' : ''}.</div>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 100px 48px', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span />
            <span>Employee</span>
            <span>Date</span>
            <span>Submitted</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {filteredEntries!.map(entry => <EntryRow key={entry.id} entry={entry} />)}
        </Card>
      )}
    </div>
  );
}
