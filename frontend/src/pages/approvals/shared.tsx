import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  useApprovalHistory, useApprove, useReject,
} from '../../api/approvals';
import { Modal } from '../../components/Modal';
import { useToast } from '../../lib/toast';
import { formatDateTime } from '../../lib/date';
import { formatDate as fmtDate, formatDurationMinutes } from '../../lib/date';
import type { EodEntryDto, EodTaskDto } from '../../api/eod';

// Shared between the Team Lead's and the Project Manager's Approvals pages — the submission
// detail modal is correctness-sensitive and must not fork between the two roles, so both pages
// import from here rather than keeping their own copies.

// ── helpers ────────────────────────────────────────────────────────────────────

const LEAVE_CATEGORY = 'Leave';

export function sumHours(tasks: EodTaskDto[]): number {
  return tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
}

export function hrs(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function entryProjects(e: EodEntryDto): string[] {
  return [...new Set(e.tasks.map(t => t.projectCode).filter((p): p is string => !!p))];
}

export function entryCategories(e: EodEntryDto): string[] {
  return [...new Set(e.tasks.map(t => t.categoryName).filter((c): c is string => !!c))];
}

/**
 * One plain-language summary of the day: leave taken, hours worked, and how much of that was
 * overtime.
 *
 * Overtime is stated as a SPLIT of the hours worked, never as a separate addend. A "Half-day
 * leave 4h" chip beside an "OT +1h" chip and a "9h total" chip forces the reader to work out
 * that 5 were actually worked, and invites reading leave + worked + OT as additive. Spelling it
 * out as "worked 4h + 1h OT = 5h" removes the arithmetic.
 *
 * regular = worked - overtime, which always lands on the day's expected hours: with 4h leave the
 * expected work is 8 - 4 = 4, so logging 5 gives 4 regular + 1 OT.
 *
 * Returns null for an ordinary working day with no overtime — nothing to clarify there.
 */
export function daySummary(entry: EodEntryDto): string | null {
  if (entry.dayType === 'HOLIDAY') return 'Holiday — no tasks';

  const leaveHours = sumHours(entry.tasks.filter(t => t.categoryName === LEAVE_CATEGORY));
  const worked = sumHours(entry.tasks.filter(t => t.categoryName !== LEAVE_CATEGORY));
  const overtime = entry.isOvertime && entry.overtimeHours != null ? Number(entry.overtimeHours) : 0;

  const parts: string[] = [];
  if (entry.dayType === 'LEAVE') {
    // A task-less full-day Leave has no rows to sum hours from — leaveHours is 0 in that case,
    // same as a normal working day with none, so this can't gate on leaveHours > 0 the way the
    // Holiday branch above gates on nothing at all. Falls back to a plain "Full-day leave" label.
    if (worked > 0) {
      parts.push(`Half-day leave ${hrs(leaveHours)}h`);
    } else {
      parts.push(leaveHours > 0 ? `Full-day leave ${hrs(leaveHours)}h` : 'Full-day leave');
    }
  }

  if (overtime > 0) {
    const regular = Math.max(0, worked - overtime);
    parts.push(`worked ${hrs(regular)}h + ${hrs(overtime)}h OT = ${hrs(worked)}h`);
  } else if (parts.length > 0 && worked > 0) {
    parts.push(`worked ${hrs(worked)}h`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One of late-arrival / early-leave / mid-shift-gap — the schema stores at most one per day.
 *
 * Takes the two fields structurally rather than a whole EodEntryDto, so the report DTOs (which
 * carry the same pair on a much smaller row) produce this wording from here instead of growing
 * their own copy of it.
 */
export function timeAdjustmentLabel(
  entry: { timeAdjustmentType: string | null; timeAdjustmentMinutes: number | null },
): string | null {
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

export function formatRelative(iso: string | null): string {
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

export function extractError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; message?: string } } };
  return e?.response?.data?.error ?? e?.response?.data?.message ?? 'Something went wrong';
}

export function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ── primitives ─────────────────────────────────────────────────────────────────

export function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

export function Btn({
  children, onClick, variant = 'default', disabled = false, style, title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'warn' | 'primary' | 'success';
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  const bg = { default: 'var(--raised2)', danger: 'var(--raised2)', warn: 'var(--raised2)', primary: 'var(--brand)', success: 'var(--ok)' }[variant];
  const border = { default: 'var(--line2)', danger: 'rgba(228,55,61,.4)', warn: 'rgba(224,169,59,.4)', primary: 'var(--brand)', success: 'var(--ok)' }[variant];
  const color = { default: 'var(--txt)', danger: 'var(--risk)', warn: 'var(--warn)', primary: '#fff', success: '#fff' }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
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

export function Chip({ children, tone = 'neutral', dashed = false }: {
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

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>
      {children}
    </div>
  );
}

// ── action panel (approve / reject) ─────────────────────────────────────────────

interface ActionPanelProps {
  type: 'approve' | 'reject' | null;
  entryId: number;
  onClose: () => void;
}

export function ActionPanel({ type, entryId, onClose }: ActionPanelProps) {
  const [comment, setComment] = useState('');
  const { show } = useToast();

  const approve = useApprove();
  const reject = useReject();

  if (!type) return null;
  const busy = approve.isPending || reject.isPending;

  async function submit() {
    try {
      if (type === 'approve') {
        await approve.mutateAsync({ entryId, comment: comment || undefined });
        show('Entry approved. Utilization recomputed.', 'success');
      } else {
        if (!comment.trim()) return;
        await reject.mutateAsync({ entryId, comment });
        show('Entry rejected.', 'success');
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
        <Btn variant={type === 'approve' ? 'success' : type === 'reject' ? 'danger' : 'warn'} onClick={submit} disabled={busy || commentEmpty}>
          {busy ? 'Saving…' : type === 'approve' ? 'Confirm Approve' : type === 'reject' ? 'Confirm Reject' : 'Request Changes'}
        </Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
    </div>
  );
}

// ── audit trail (submitted → actions) ───────────────────────────────────────────

export function AuditTrail({ entry, extraEntries }: { entry: EodEntryDto; extraEntries?: React.ReactNode }) {
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
        {extraEntries}
      </ul>
      {entry.reviewerComment && (
        <div style={{ background: 'color-mix(in srgb, var(--risk) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--risk) 30%, transparent)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--txt)', marginTop: 10, maxWidth: 520 }}>
          <strong>Reject reason: </strong>{entry.reviewerComment}
        </div>
      )}
    </div>
  );
}

// ── submission detail modal ─────────────────────────────────────────────────────

export function SubmissionDetailModal({
  entry, onClose, onApprove, onReject, approveBusy, rejectBusy = false,
}: {
  entry: EodEntryDto | null;
  onClose: () => void;
  onApprove: (entryId: number) => void;
  /** Called only once a reason has been entered — rejecting without one is not possible. */
  onReject: (entryId: number, reason: string) => void;
  approveBusy: boolean;
  rejectBusy?: boolean;
}) {
  // Rejecting happens in place: the first Reject click reveals the reason box below Remarks, the
  // second submits it. A separate confirm dialog used to hide the work being judged.
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // Reset when a different entry is opened, so a half-typed reason never follows you to the next one.
  useEffect(() => {
    setRejecting(false);
    setReason('');
  }, [entry?.id]);

  const editable = entry?.status === 'SUBMITTED';
  const reasonEmpty = reason.trim() === '';

  return (
    <Modal
      open={entry != null}
      title={entry ? `${entry.employeeName} — ${fmtDate(entry.entryDate)}` : 'Submission'}
      onClose={onClose}
      width={640}
      footer={entry && editable ? (
        rejecting ? (
          <>
            <Btn onClick={() => { setRejecting(false); setReason(''); }} disabled={rejectBusy}>Cancel</Btn>
            <Btn
              variant="danger"
              onClick={() => onReject(entry.id, reason.trim())}
              disabled={reasonEmpty || rejectBusy}
              title={reasonEmpty ? 'Enter a rejection reason first.' : undefined}
            >
              {rejectBusy ? 'Rejecting…' : <><X size={12} aria-hidden="true" /> Reject</>}
            </Btn>
          </>
        ) : (
          <>
            <Btn variant="danger" onClick={() => setRejecting(true)}><X size={12} aria-hidden="true" /> Reject</Btn>
            <Btn
              variant="success"
              onClick={() => onApprove(entry.id)}
              disabled={approveBusy}
            >
              {approveBusy ? 'Approving…' : <><Check size={12} aria-hidden="true" /> Approve</>}
            </Btn>
          </>
        )
      ) : undefined}
    >
      {entry && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FieldLabel>Tasks</FieldLabel>
          {entry.tasks.map(t => (
            <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
              <div className="nf-r-pairs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 110px', gap: 10, marginBottom: 8 }}>
                <div><FieldLabel>Project</FieldLabel><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)' }}>{t.projectCode ?? '—'}</div></div>
                <div><FieldLabel>Category</FieldLabel><div style={{ fontSize: 12.5, color: 'var(--txt)' }}>{t.categoryName ?? '—'}</div></div>
                <div><FieldLabel>Hours</FieldLabel><div style={{ fontSize: 12.5, color: 'var(--txt)' }}>{t.hours != null ? `${hrs(Number(t.hours))}h` : '—'}</div></div>
                <div><FieldLabel>Status</FieldLabel><div style={{ fontSize: 12.5, color: 'var(--txt)' }}>{t.taskStatus}</div></div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{t.description || '—'}</div>
              {t.taskStatus === 'BLOCKED' && t.blockerReason && (
                <div style={{ fontSize: 11.5, color: 'var(--risk)', marginTop: 8 }}>Blocker: {t.blockerReason}</div>
              )}
            </div>
          ))}

          <div>
            <FieldLabel>Next-day plan</FieldLabel>
            <div style={{ fontSize: 12.5, color: 'var(--txt)', background: 'var(--raised)', borderRadius: 6, padding: 10 }}>{entry.nextDayPlan || '—'}</div>
          </div>
          <div>
            <FieldLabel>Remarks</FieldLabel>
            <div style={{ fontSize: 12.5, color: 'var(--txt)', background: 'var(--raised)', borderRadius: 6, padding: 10 }}>{entry.remarks || '—'}</div>
          </div>

          {/* Asked for right here, below Remarks, once Reject is clicked — the reviewer stays on the
              work they are judging while writing why. */}
          {rejecting && editable && (
            <div>
              <FieldLabel>Rejection reason *</FieldLabel>
              <textarea
                rows={3}
                autoFocus
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Missing task description for the overtime hours logged"
                style={{
                  width: '100%', resize: 'vertical', padding: 10, background: 'var(--raised2)',
                  border: `1px solid ${reasonEmpty ? 'color-mix(in srgb, var(--risk) 45%, var(--line2))' : 'var(--line2)'}`,
                  borderRadius: 8, color: 'var(--txt)', fontSize: 12.5, fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 4 }}>
                This reason is shared with the employee.
              </div>
            </div>
          )}

          {/* A rejected entry must always show why, not only in the expanded audit trail. */}
          {entry.status === 'REJECTED' && entry.reviewerComment && (
            <div>
              <FieldLabel>Rejection reason</FieldLabel>
              <div style={{
                fontSize: 12.5, color: 'var(--txt)', borderRadius: 6, padding: 10,
                background: 'color-mix(in srgb, var(--risk) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--risk) 30%, transparent)',
              }}>
                {entry.reviewerComment}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
