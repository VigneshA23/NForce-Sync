import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock, XCircle, Paperclip, X, Loader2, MessageCircleQuestion } from 'lucide-react';
import { useClarificationStatus } from '../../api/eodClarification';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { todayISO, formatDate, formatTime12h } from '../../lib/date';
import { listProjects } from '../../api/projects';
import { listTaskCategories } from '../../api/taskCategories';
import {
  saveDraft, submitEntry, listEntries, getTimeAdjustmentContext, getDayDefaults,
  uploadEodAttachment, deleteEodAttachment, getEodAttachmentDataUrl,
} from '../../api/eod';
import { DatePicker } from '../../components/DatePicker';
import { GlobalLoader } from '../../components/GlobalLoader';
import type { EodEntryDto, EodTaskDto, EodAttachmentDto } from '../../api/eod';
import {
  ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS_PER_TASK,
  fmtAttachmentSize, validateAttachmentFile, previewEodAttachment,
} from '../../lib/eodAttachments';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * The empty first entry is the default, so status is a deliberate choice rather than a silent
 * "Completed". Kept in this list (not a bare <option> in the markup) so the read-only view and
 * the validator resolve labels from one place.
 */
const TASK_STATUSES = [
  { value: '',            label: 'Status' },
  { value: 'COMPLETED',   label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'BLOCKED',     label: 'Blocked' },
  { value: 'NOT_STARTED', label: 'Not Started' },
];

const WORK_LOCATIONS = ['Office', 'Remote', 'Client Site', 'Field'];

/** Category name, renamed from 'Leave / Holiday' in V35 — Holiday is a day type now. */
const LEAVE = 'Leave';

/**
 * Cap on every free-text field on this form (description, blocker reason, next-day plan,
 * remarks). Mirrored by @Size(max = 300) on SaveEodRequest/SaveEodTaskRequest, so the API
 * rejects an over-long value even if it bypasses this input.
 */
const MAX_TEXT_LEN = 300;

const DAY_TYPES = [
  { value: 'WORKING_DAY',       label: 'Working day' },
  { value: 'FIRST_HALF_LEAVE',  label: 'First Half Leave' },
  { value: 'SECOND_HALF_LEAVE', label: 'Second Half Leave' },
  { value: 'LEAVE',             label: 'Leave' },
  { value: 'HOLIDAY',           label: 'Holiday' },
  { value: 'WEEKEND',           label: 'Weekend' },
];

/** Labels for the two half-day leave types, reused by both the "no tasks" gate and messages. */
const HALF_LEAVE_LABELS: Record<string, string> = {
  FIRST_HALF_LEAVE:  'First Half Leave',
  SECOND_HALF_LEAVE: 'Second Half Leave',
};


/**
 * Fallback only — used for the one render before `dayDefaults` (below) has loaded, or if that
 * call fails. The REAL value comes from GET /api/eod/day-defaults, which now also returns
 * business_rule_config.standard_hours_per_day (read live by the backend on every call). That
 * endpoint isn't gated SUPERADMIN like /api/admin/business-rules, so an ordinary employee can
 * read it — see EodService.getDayDefaults. Kept in sync with EodService's own FALLBACK_HOURS_PER_DAY.
 */
const FALLBACK_HOURS_PER_DAY = 8;

/**
 * Hard bounds for one day's logged hours, both inclusive. Distinct from the configured working
 * hours cap, which is only a reference — going over THAT is overtime and allowed. These bound what is
 * plausible for a day: an entry totalling 0 records nothing, and more than 24 is a typo.
 * Mirrored server-side in EodService.
 */
const MIN_HOURS_PER_DAY = 2;
const MAX_HOURS_PER_DAY = 24;

/** Per-use duration limits for a time adjustment. Mirrored server-side in EodService. */
const MIN_ADJ_MINUTES = 30;
const MAX_ADJ_MINUTES = 120;

/**
 * Duration choices for ALL three adjustment types: 30 minutes to 2 hours in 15-minute steps.
 * A fixed list rather than free text means the 30-120 policy range cannot be violated from the
 * UI at all. The server still re-checks it — the dropdown is a convenience, not the guarantee.
 */
const ADJ_MINUTE_OPTIONS = [30, 45, 60, 75, 90, 105, 120];

const ADJ_TYPES = [
  { value: 'LATE_ARRIVAL', label: 'Late arrival',         durationLabel: 'Will come late by' },
  { value: 'INTERVENING',  label: 'Intervening time-off', durationLabel: 'Time away during shift' },
  { value: 'EARLY_LEAVE',  label: 'Leaving early',        durationLabel: 'Will leave early by' },
];

function minutesLabel(m: number): string {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hLabel = h === 1 ? '1 hour' : `${h} hours`;
  return rem === 0 ? hLabel : `${hLabel} ${rem} minutes`;
}

/** 'HH:mm:ss' → minutes since midnight. */
function timeToMinutes(hms: string): number {
  const [h, m] = hms.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight → 'HH:mm' for formatTime12h, wrapping past midnight. */
function minutesToHm(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Total minutes → "H.MM" for the "hrs expected" indicator's numerator — NOT decimal hours.
 * 45 minutes renders as ".45", not ".75" (which is what 45 minutes actually is in decimal
 * hours). `totalMinutes` needs no pre-rounding into an hours/minutes pair by the caller: any
 * value (e.g. 30 task-minutes + 45 adjustment-minutes = 75) rolls over into the next hour here.
 * Only ever used for DISPLAY — every real comparison (overtime, min/max-hours validation) uses
 * the actual decimal-hours value (totalMinutes / 60), never this string.
 */
function formatHrsMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return `${hours}.${String(remainder).padStart(2, '0')}`;
}


/**
 * Identifies a specific version of the server's entry for a date. Used to decide whether the
 * form still reflects what the server last said. `updatedAt` moves on every server-side change,
 * so a manager's reject produces a different signature and forces the form to re-populate.
 *
 * Compared as a parsed epoch millisecond, NOT the raw ISO string: the exact same instant comes
 * back formatted two different ways depending on which endpoint returned it — e.g. the draft-save
 * response's in-memory `OffsetDateTime.now()` serializes with the server's own zone offset and
 * nanosecond-scale fractional digits, while a subsequent GET re-reads the same TIMESTAMPTZ column
 * back from Postgres (which normalizes to UTC and microsecond precision), serializing as `...Z`
 * with one fewer fractional digit. Comparing those two strings for equality treats a genuinely
 * unchanged row as "different", which defeated this exact guard: the implicit draft-save that
 * fires on a task's first-ever attachment upload triggered a refetch whose string didn't match,
 * so the populate effect "helpfully" replaced the just-created task rows (fresh local IDs) out
 * from under the upload that was about to attach to the old one — silently dropping it. Comparing
 * epoch millis is immune to the formatting difference while still catching an actually later
 * timestamp.
 */
function entrySignature(date: string, entry?: EodEntryDto | null): string {
  return entry ? `${date}|${entry.id}|${entry.status}|${new Date(entry.updatedAt).getTime()}` : `${date}|none`;
}

// ── Local task row type ────────────────────────────────────────────────────────

interface TaskRow {
  localId: string;
  projectId: number | null;
  /** Code as saved on the entry. Survives an allocation ending, which would drop the
   *  project from the (allocation-scoped) dropdown and leave nothing to resolve against. */
  projectCode: string | null;
  taskCategoryId: number | null;
  categoryName: string | null;
  description: string;
  hours: string;
  taskStatus: string;
  blockerReason: string;
  supportNeeded: string;
  attachments: EodAttachmentDto[];
  /** Client-side validation error for THIS row's attach control — kept per-row so one task's
   *  bad file doesn't clobber another's error message. */
  attachError: string | null;
  /** Name of the file THIS row is currently uploading, or null when idle — drives the row's
   *  loading chip and blocks a second concurrent pick until this one settles. */
  uploadingFileName: string | null;
  /** Fraction (0–1) of uploadingFileName's bytes sent so far, or null before the browser has
   *  reported a first progress event. Ignored when uploadingFileName is null. */
  uploadProgress: number | null;
}

let rowSeq = 0;

function newRow(): TaskRow {
  return {
    localId:          `row-${++rowSeq}`,
    projectId:        null,
    projectCode:      null,
    taskCategoryId:   null,
    categoryName:     null,
    description:      '',
    hours:            '',
    taskStatus:       '', // no default — the employee must pick one
    blockerReason:    '',
    supportNeeded:    '',
    attachments:      [],
    attachError:      null,
    uploadingFileName: null,
    uploadProgress:   null,
  };
}

/**
 * True when a row is still the untouched placeholder state — no project, category, hours,
 * status, description or attachment. Only meaningful for a Weekend day, where task logging is
 * optional: the default (or a freshly-added, still-empty) row must not be treated as "a task the
 * employee logged" and forced through the same required-field checks a Working Day row gets.
 */
function isTaskRowBlank(t: TaskRow): boolean {
  return !t.projectId && !t.taskCategoryId && t.hours.trim() === ''
    && t.taskStatus === '' && !t.description.trim() && t.attachments.length === 0;
}

function rowFromDto(dto: EodTaskDto): TaskRow {
  return {
    localId:          `row-${++rowSeq}`,
    projectId:        dto.projectId,
    projectCode:      dto.projectCode,
    taskCategoryId:   dto.taskCategoryId,
    categoryName:     dto.categoryName,
    description:      dto.description ?? '',
    hours:            dto.hours != null ? String(dto.hours) : '',
    taskStatus:       dto.taskStatus ?? '', // no default — matches project/category/hours
    blockerReason:    dto.blockerReason ?? '',
    supportNeeded:    dto.supportNeeded ?? '',
    attachments:      dto.attachments ?? [],
    attachError:      null,
    uploadingFileName: null,
    uploadProgress:   null,
  };
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; label: string; Icon: React.FC<{ size: number }> }> = {
    DRAFT:             { color: '#9BA1AC', label: 'Draft',             Icon: Clock },
    SUBMITTED:         { color: '#4C8DD6', label: 'Submitted',         Icon: Clock },
    APPROVED:          { color: '#2FB67C', label: 'Approved',          Icon: CheckCircle },
    REJECTED:          { color: '#E4373D', label: 'Rejected',          Icon: XCircle },
    MISSED:            { color: '#6B7280', label: 'Missed',            Icon: XCircle },
  };
  const { color, label, Icon } = cfg[status] ?? cfg.DRAFT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}40`,
      fontSize: 11, fontWeight: 500, color,
    }}>
      <Icon size={11} aria-hidden />
      {label}
    </span>
  );
}

// ── Form input primitives ──────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
      {children}
    </div>
  );
}

/** Required-field marker, matching the asterisk already used on the blocker-reason label. */
function Req() {
  return <span style={{ color: '#E4373D' }}>*</span>;
}

/**
 * The one "Add task" control, shared by the normal (Working Day, etc.) Tasks section and the
 * collapsed Weekend state — same element either way, never a second/simplified control.
 */
function AddTaskButton({ onClick, style }: { onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 6,
        background: 'transparent', border: '1px dashed var(--line2)',
        color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
        transition: 'border-color 120ms, color 120ms',
        ...style,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line2)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt-mut)';
      }}
    >
      <Plus size={14} aria-hidden />
      Add task
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'var(--raised2)', border: '1px solid var(--line2)',
  borderRadius: 6, color: 'var(--txt)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  opacity: 0.45,
  cursor: 'not-allowed',
};

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...(props.disabled ? disabledInputStyle : inputStyle), ...props.style }} />;
}

function Sel(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{ ...(props.disabled ? disabledInputStyle : inputStyle), ...props.style }}>
      {props.children}
    </select>
  );
}

function Txt(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{ ...inputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.5, ...props.style }} />
  );
}

/**
 * Live "n/300 characters used" hint under a capped textarea. Without it, maxLength silently
 * stops accepting input and the field just appears to freeze — this makes the reason visible,
 * and turns amber once the cap is actually reached.
 *
 * aria-live="polite" so screen readers hear the remaining count as it changes, rather than only
 * discovering the limit by hitting it.
 */
function CharCount({ value, max = MAX_TEXT_LEN }: { value: string; max?: number }) {
  const used = value.length;
  const atLimit = used >= max;
  return (
    <div
      aria-live="polite"
      style={{
        fontSize: 11,
        color: atLimit ? 'var(--warn)' : 'var(--txt-dim)',
        textAlign: 'right',
        marginTop: 4,
      }}
    >
      {used}/{max} characters used
    </div>
  );
}

// ── Attachment list (shared by the EOD-level and every task-level attach control) ──────────────

/** "Preview" is the only piece of this chip that's a link rather than decoration, so it needs
 *  its own hover affordance (underline + brighten) to read as clickable — a plain color-only
 *  button looks identical to inert label text next to it. */
function PreviewAttachmentLink({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 2px 2px 4px', fontSize: 11,
        color: hovered ? 'var(--brand)' : 'var(--info)',
        textDecoration: hovered ? 'underline' : 'none',
      }}
    >
      Preview
    </button>
  );
}

function AttachmentList({
  attachments, onPreview, onRemove, readOnly, uploadingFileName, uploadProgress,
}: {
  attachments: EodAttachmentDto[];
  onPreview: (attachment: EodAttachmentDto) => void;
  onRemove: (id: number) => void;
  readOnly: boolean;
  /** Name of a file this scope is currently uploading, rendered as a trailing loading chip —
   *  the upload lifecycle's in-progress state. Omit/null when nothing is in flight. */
  uploadingFileName?: string | null;
  /** Fraction (0–1) of uploadingFileName's bytes sent so far — drives the chip's progress bar
   *  width. Null before the browser reports a first event (chip shows an indeterminate bar). */
  uploadProgress?: number | null;
}) {
  if (attachments.length === 0 && !uploadingFileName) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {attachments.map(a => (
        <span key={a.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 9px', borderRadius: 20,
          background: 'var(--raised2)', border: '1px solid var(--line2)', fontSize: 11.5, color: 'var(--txt)',
        }}>
          <Paperclip size={11} aria-hidden="true" style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
          {a.fileName} <span style={{ color: 'var(--txt-dim)' }}>({fmtAttachmentSize(a.fileSize)})</span>
          <PreviewAttachmentLink onClick={() => onPreview(a)} />
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${a.fileName}`}
              style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 2 }}
            >
              <X size={11} aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {/* Upload in progress — the loading state of the lifecycle. Two phases, both real (never a
          fixed fake delay):
          1. Sending — the bar's width tracks the byte count the browser's own upload progress
             event reports (see uploadEodAttachment's onProgress), so a 200 KB file's bar fills in
             a blink and a 10 MB one visibly tracks its transfer.
          2. Finishing — every byte is on the wire (fraction reaches 1) but the server hasn't
             answered yet (it's still writing the file). This can visibly outlast the send itself,
             so the bar switches to indeterminate and the label changes rather than sitting on a
             motionless "100%" that reads as hung.
          Success/failure resolve this into a real chip above (via the parent's onSuccess) or the
          row's attachError message. */}
      {uploadingFileName && (() => {
        const sending = uploadProgress != null && uploadProgress < 1;
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 20,
            background: 'var(--raised2)', border: '1px dashed var(--line2)', fontSize: 11.5, color: 'var(--txt-mut)',
          }}>
            <Loader2 size={11} className="nf-r-spin" aria-hidden="true" style={{ color: 'var(--info)', flexShrink: 0 }} />
            {sending ? <>Uploading {uploadingFileName}…</> : <>Finishing {uploadingFileName}…</>}
            <span style={{
              position: 'relative', width: 48, height: 4, borderRadius: 2, overflow: 'hidden',
              background: 'var(--line2)', flexShrink: 0,
            }}>
              <span style={{
                position: 'absolute', inset: '0 auto 0 0', height: '100%', borderRadius: 2,
                background: 'var(--info)',
                width: sending ? `${Math.round(uploadProgress! * 100)}%` : '35%',
                transition: sending ? 'width 150ms linear' : undefined,
                ...(sending ? {} : { animation: 'nf-r-indeterminate 1.1s ease-in-out infinite' }),
              }} />
            </span>
            {sending && <span>{Math.round(uploadProgress! * 100)}%</span>}
          </span>
        );
      })()}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SubmitEOD() {
  useAuth(); // ensures protected route; user identity carried by JWT
  const { show: toast } = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // Date selector
  const [selectedDate, setSelectedDate] = useState<string>(() => searchParams.get('date') ?? todayISO());

  // Entry state — updated from backend responses
  const [entryId, setEntryId] = useState<number | null>(null);
  const [entryStatus, setEntryStatus] = useState<string | null>(null);

  // Form fields
  const [dayType,      setDayType]      = useState('WORKING_DAY');
  const [workLocation, setWorkLocation] = useState('');
  const [nextDayPlan,  setNextDayPlan]  = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [tasks,        setTasks]        = useState<TaskRow[]>([newRow()]);
  const [reviewerComment, setReviewerComment] = useState<string | null>(null);

  // Weekend only: the task-row fields start hidden behind the "Add task" button — set once the
  // employee clicks it, so the collapsed state doesn't reappear on every re-render. A saved/typed
  // real task (see hasRealWeekendTask below) shows the rows regardless of this flag, so reopening
  // a day that already has weekend OT logged never hides it behind a click.
  const [weekendExpanded, setWeekendExpanded] = useState(false);

  // Time adjustment (Working day only)
  const [adjEnabled, setAdjEnabled] = useState(false);
  const [adjType,    setAdjType]    = useState<string | null>(null);
  const [adjMinutes, setAdjMinutes] = useState<string>('');
  const [showBalance, setShowBalance] = useState(false);

  // Validation errors (client-side)
  const [errors, setErrors] = useState<string[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);

  // Track if form has been populated from the query for the current date
  // Signature of the server state already copied into the form — NOT just the date.
  //
  // Keying on the date alone meant a stale cached entry got applied first (React Query serves
  // cache immediately, so isLoading is false), and when the background refetch returned the real
  // status the effect bailed out as "already applied". Arriving from a rejection notification
  // therefore showed the form read-only until a hard refresh emptied the cache.
  //
  // updatedAt changes on every server-side mutation, so a genuinely newer entry re-populates
  // while a redundant refetch of identical state leaves in-progress edits alone.
  const appliedRef = useRef<string | null>(null);

  // ── Backend queries ───────────────────────────────────────────────────────

  // Scoped to this user's allocations as of the selected date, so the key must include it.
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects', 'mine', selectedDate],
    queryFn:  () => listProjects(selectedDate),
    staleTime: 5 * 60_000,
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['task-categories'],
    queryFn:  listTaskCategories,
    staleTime: 5 * 60_000,
  });

  const { data: entries = [], isLoading: loadingEntry } = useQuery({
    queryKey: ['eod', selectedDate],
    queryFn:  () => listEntries(undefined, selectedDate, selectedDate),
  });

  // Day Type / Work Location auto-population source for the selected date — holiday calendar
  // today, extensible to leave/shift sources later without touching the populate effect below.
  // Only ever consulted when there's no saved entry for the date (see the effect); a saved
  // entry's own values always win.
  //
  // Also carries workingHoursPerDay (a live Super Admin Business Rules value — see
  // dailyHoursCap below), which must never look stale, so staleTime:0 overrides the 30s
  // default in main.tsx's QueryClient: every remount or window refocus (React Query's default
  // refetchOnMount/refetchOnWindowFocus behavior only refetches when data IS stale) hits the
  // network again instead of serving a cached value from before a Business Rules change.
  // Same pattern as notifications.ts's own staleTime:0 override.
  const { data: dayDefaults, isLoading: loadingDayDefaults } = useQuery({
    queryKey: ['eod', 'day-defaults', selectedDate],
    queryFn:  () => getDayDefaults(selectedDate),
    staleTime: 0,
  });

  // The Super Admin's configured Standard Working Hours (Business Rules → Time & Attendance),
  // read fresh on every day-defaults fetch — a single global value, not scoped by role,
  // department, or entry date. Same source EodService.dailyHoursCap() reads server-side, so the
  // "X / Y hrs" target below and the server's minimum-hours rejection can never disagree.
  const dailyHoursCap = dayDefaults?.workingHoursPerDay ?? FALLBACK_HOURS_PER_DAY;

  // Shift timings + real monthly allowance usage. Keyed by date so the month's counts follow
  // the entry date rather than today.
  const { data: adjContext } = useQuery({
    queryKey: ['eod', 'time-adjustment-context', selectedDate],
    queryFn:  () => getTimeAdjustmentContext(selectedDate),
  });

  // The error list renders above the form, so pressing Submit from the bottom of a long task list
  // showed nothing at all until you scrolled up. Bring it into view instead. Same scrollIntoView
  // pattern the Approvals row-highlight uses.
  useEffect(() => {
    if (errors.length === 0) return;
    errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errors]);

  // ── Populate form when entry loads for the selected date ──────────────────

  useEffect(() => {
    // Also wait on dayDefaults so a fresh date doesn't flash WORKING_DAY/Office before the
    // holiday check resolves and immediately flips it to HOLIDAY.
    if (loadingEntry || loadingDayDefaults) return;

    const entry: EodEntryDto | undefined = entries[0];
    const signature = entrySignature(selectedDate, entry);
    if (appliedRef.current === signature) return; // same server state already in the form
    appliedRef.current = signature;

    if (entry) {
      setEntryId(entry.id);
      setEntryStatus(entry.status);
      setDayType(entry.dayType ?? 'WORKING_DAY');
      setAdjEnabled(entry.timeAdjustmentType != null);
      setAdjType(entry.timeAdjustmentType ?? null);
      setAdjMinutes(entry.timeAdjustmentMinutes != null ? String(entry.timeAdjustmentMinutes) : '');
      setWorkLocation(entry.workLocation ?? '');
      setNextDayPlan(entry.nextDayPlan ?? '');
      setRemarks(entry.remarks ?? '');
      setReviewerComment(entry.reviewerComment ?? null);

      setTasks(entry.tasks.length > 0
        ? entry.tasks.map(t => rowFromDto(t))
        : [newRow()],
      );
      // A saved entry with real weekend OT rows shows them via hasRealWeekendTask below
      // regardless of this flag — reset it plainly rather than trying to infer it from the entry.
      setWeekendExpanded(false);
    } else {
      setEntryId(null);
      setEntryStatus(null);
      // No saved entry for this date yet — auto-populate from the resolved source of truth
      // (holiday calendar today) rather than hardcoding, falling back to Working day/Office
      // when nothing overrides it for this date.
      setDayType(dayDefaults?.dayType ?? 'WORKING_DAY');
      setAdjEnabled(false);
      setAdjType(null);
      setAdjMinutes('');
      setWorkLocation(dayDefaults?.workLocation ?? '');
      setNextDayPlan('');
      setRemarks('');
      setReviewerComment(null);
      setTasks([newRow()]);
      setWeekendExpanded(false);
    }
    setErrors([]);
  }, [entries, loadingEntry, selectedDate, categories, dayDefaults, loadingDayDefaults]);

  // Clear the applied signature when the date changes so the next query result repopulates
  function handleDateChange(d: string) {
    appliedRef.current = null;
    setSelectedDate(d);
    setErrors([]);
  }

  function handleDayTypeChange(next: string) {
    setDayType(next);
    // A fresh switch into (or out of) Weekend should start collapsed again — any already-typed
    // real task still shows via hasRealWeekendTask regardless of this flag.
    setWeekendExpanded(false);
    // A holiday and a full-day leave carry no work location — but a half-day leave still does,
    // since the other half of the day is still worked.
    const nextIsWorkDay = next === 'WORKING_DAY' || next === 'FIRST_HALF_LEAVE' || next === 'SECOND_HALF_LEAVE';
    if (!nextIsWorkDay) setWorkLocation('');
    // A time adjustment only exists on a full working day — leaving one behind would submit an
    // adjustment the form no longer shows. The server clears it too.
    if (next !== 'WORKING_DAY') {
      setAdjEnabled(false);
      setAdjType(null);
      setAdjMinutes('');
      setShowBalance(false);
    }
    setErrors([]);
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const isReadOnly   = entryStatus === 'SUBMITTED' || entryStatus === 'APPROVED' || entryStatus === 'MISSED';
  const isEditable   = !isReadOnly;
  // Correction flow: the employee must fix THIS day's report. Re-dating it would leave the
  // flagged entry untouched and write a different day instead, so the date is pinned while
  // the rest of the form stays editable. Kept separate from isReadOnly, whose dates must stay
  // navigable.
  const isDateLocked = entryStatus === 'REJECTED';
  // A submitted entry is already fully locked by isReadOnly above (isEditable() on the backend
  // only allows DRAFT/REJECTED) — a TL-requested clarification doesn't change that, it's purely
  // an explanatory reason shown on top of the existing "submitted, awaiting review" lock.
  const { data: clarificationStatus } = useClarificationStatus(
    entryId ?? undefined, 'employee', entryStatus === 'SUBMITTED',
  );
  const hasOpenClarification = clarificationStatus?.open === true;
  const totalHours   = tasks.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0);
  const catMap       = new Map(categories.map(c => [c.id, c]));

  // Gates the entry spinner/form-body split below — also waits on dayDefaults so the form
  // doesn't render with stale field values for the beat before auto-population runs.
  const formLoading = loadingEntry || loadingDayDefaults;

  const isHoliday  = dayType === 'HOLIDAY';
  const isLeaveDay = dayType === 'LEAVE';
  // A half-day leave still has a worked half — tasks and a work location are required, just
  // like a working day, only the minimum-hours bar (below) is lower. Deliberately NOT folded
  // into isNonWorkDay, which is reserved for days with nothing at all to log.
  const isHalfLeave = dayType === 'FIRST_HALF_LEAVE' || dayType === 'SECOND_HALF_LEAVE';
  // Leave now reuses the Holiday "nothing to log" treatment: no tasks, no work location,
  // no time adjustment. Neither day type has productive work to enter.
  const isNonWorkDay = isHoliday || isLeaveDay;
  // A weekend is a non-working day too, but — unlike Holiday/Leave — it still shows the Tasks
  // section: any task logged there is optional overtime, so it is deliberately NOT folded into
  // isNonWorkDay (which hides the whole Tasks section, see the render below).
  const isWeekend = dayType === 'WEEKEND';
  const workLocDisabled = isNonWorkDay || isWeekend;
  // True once a row actually carries something (see isTaskRowBlank) — a saved/typed real weekend
  // OT task shows the row fields even if the employee never clicked "Add task" this session
  // (e.g. reopening a day that already has one). Combined with weekendExpanded (set by the click
  // itself) to decide whether the task-row fields are visible at all on a Weekend day.
  const hasRealWeekendTask = isWeekend && tasks.some(t => !isTaskRowBlank(t));
  const showWeekendTaskRows = hasRealWeekendTask || weekendExpanded;

  // ── Time adjustment derived state ─────────────────────────────────────────
  const isWorkingDay  = dayType === 'WORKING_DAY';
  const shiftAssigned = adjContext?.shiftAssigned === true;
  // Without a shift there are no timings to compute "reach office by" or expectedHours from,
  // so the whole feature is unavailable rather than half-working.
  const canRequestAdj = isWorkingDay && shiftAssigned;
  const adjMins       = parseInt(adjMinutes, 10) || 0;
  const adjActive     = canRequestAdj && adjEnabled && adjType != null && adjMins > 0;

  /**
   * One monthly pool of minutes shared across all three types (V62), straight from the backend.
   * The backend already excludes drafts, rejected entries and this very day, so `remaining` is
   * exactly what this entry may still spend.
   */
  const adjBudget    = adjContext?.monthlyAdjustmentMinutes ?? 0;
  const adjUsedMins  = adjContext?.adjustmentMinutesUsed ?? 0;
  const adjRemaining = Math.max(0, adjBudget - adjUsedMins);
  /** No headroom left at all — every type is unavailable, not just the one already used. */
  const adjExhausted = adjRemaining <= 0;

  const shiftMins    = adjContext?.shiftDurationMinutes ?? 0;
  // A half-day leave is only expected to cover half the standard day, so that half — not the
  // full dailyHoursCap — is both its minimum-hours floor and its overtime reference. Mirrors
  // EodService.halfDayHoursCap()/applyOvertime.
  const halfDayHoursCap = dailyHoursCap / 2;
  // The TARGET never moves for a time adjustment — only which hours count as "logged" does (see
  // totalMinutesLogged below). Mirrors EodService.applyOvertime, which keeps its `reference`
  // fixed and adds the adjustment to the worked-hours side of the comparison instead.
  // A weekend has no baseline at all — the target is 0, so any hours logged are entirely
  // overtime, mirroring EodService.applyOvertime's zeroed reference for DayType.WEEKEND.
  const expectedHrs  = isWeekend ? 0 : (isHalfLeave ? halfDayHoursCap : dailyHoursCap);
  /** Unpaid break implied by the gap between the rostered span and the paid working day. */
  const breakMins    = Math.max(0, shiftMins - dailyHoursCap * 60);
  // Logged hours for the day = task rows + an active time adjustment's duration, counted in
  // whole minutes so a rollover (e.g. 30 task-minutes + 45 adjustment-minutes = 75) correctly
  // carries into the next hour instead of ever showing a 60+ minute remainder. This is the value
  // used for BOTH the "hrs expected" indicator (formatted specially, see formatHrsMinutes) and
  // the real decimal-hours arithmetic below (overtime, min/max-hours validation) — never the
  // formatted STRING. Mirrors EodService.applyOvertime/validateLoggedDay.
  const totalMinutesLogged = Math.round(totalHours * 60) + (adjActive ? adjMins : 0);
  const effectiveLoggedHours = totalMinutesLogged / 60;
  const overtimeHrs  = Math.max(0, effectiveLoggedHours - expectedHrs);
  const hasOvertime  = !isNonWorkDay && overtimeHrs > 0.001;

  /** Live impact line. Exact wording matches the approved prototype. */
  function adjBanner(): string {
    if (!adjType) return 'Select a time adjustment type to see the calculated impact.';
    if (adjMins <= 0) {
      return adjType === 'LATE_ARRIVAL'
        ? 'Choose how late you will arrive (30 minutes to 2 hours).'
        : 'Choose a duration (30 minutes to 2 hours).';
    }
    const start = adjContext?.shiftStart ? timeToMinutes(adjContext.shiftStart) : 0;
    const end   = adjContext?.shiftEnd   ? timeToMinutes(adjContext.shiftEnd)   : 0;
    if (adjType === 'LATE_ARRIVAL') {
      return `You will have to reach office by ${formatTime12h(minutesToHm(start + adjMins))}`;
    }
    if (adjType === 'EARLY_LEAVE') {
      return `You can leave office by ${formatTime12h(minutesToHm(end - adjMins))}`;
    }
    return `You will be away from office for ${adjMins} minutes during your shift.`;
  }

  function handleAdjToggle(checked: boolean) {
    setAdjEnabled(checked);
    if (!checked) { setAdjType(null); setAdjMinutes(''); setShowBalance(false); }
    setErrors([]);
  }

  function handleAdjTypeChange(next: string) {
    setAdjType(next);
    setAdjMinutes(''); // the two input styles don't share a scale, so never carry a value over
    setErrors([]);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const draftMutation = useMutation({
    mutationFn: saveDraft,
    // No toast here. Submit reuses this mutation to persist the form before submitting, and a
    // mutate()-level onSuccess does NOT replace this one — both run — so a toast here surfaced
    // "Draft saved" alongside "EOD submitted successfully" on every submit. The toast belongs to
    // the button the user actually pressed, so it lives in handleSaveDraft instead.
    onSuccess: (entry) => {
      setEntryId(entry.id);
      setEntryStatus(entry.status);
      setReviewerComment(null);
      appliedRef.current = entrySignature(selectedDate, entry); // our own refetch is a no-op
      qc.invalidateQueries({ queryKey: ['eod'] });
    },
    onError: (err: unknown) => {
      const msg = extractError(err);
      toast(msg, 'error');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => submitEntry(id),
    onSuccess: (entry) => {
      setEntryStatus(entry.status);
      appliedRef.current = entrySignature(selectedDate, entry);
      qc.invalidateQueries({ queryKey: ['eod'] });
      toast('EOD submitted successfully');
    },
    onError: (err: unknown) => {
      toast(extractError(err), 'error');
    },
  });

  // ── Attachments ────────────────────────────────────────────────────────────
  // Uploads always go up as EOD-level (no taskId) — a task row has no stable server id from the
  // frontend's perspective (every eod_task row is destroyed and recreated on each Save Draft, so
  // the app never tracks one client-side; see EodService.saveDraft). Task-level association is
  // carried entirely through buildRequest()'s per-task attachmentIds, which the server re-points
  // to the freshly-created task row on the next save — see EodAttachmentService.reassignForSave.

  const uploadMutation = useMutation({
    mutationFn: ({ file, entryId: id, onProgress }: {
      file: File; entryId: number; onProgress: (fraction: number) => void;
    }) => uploadEodAttachment(id, file, undefined, onProgress),
  });
  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => deleteEodAttachment(attachmentId),
  });

  /** Runs `onReady(entryId)` once an entry id exists — saving a draft first if none does yet,
   *  the same implicit-save-before-continuing pattern handleSubmit already uses. `onFail` covers
   *  that implicit draft save failing (draftMutation's own onError already toasts the generic
   *  message; this lets a caller also clear its own in-flight state, e.g. an upload spinner that
   *  would otherwise spin forever since onReady never fires). */
  function withEntryId(onReady: (id: number) => void, onFail?: (err: unknown) => void) {
    if (entryId != null) { onReady(entryId); return; }
    draftMutation.mutate(buildRequest(), { onSuccess: (entry) => onReady(entry.id), onError: onFail });
  }

  function handleTaskFileSelected(localId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const row = tasks.find(t => t.localId === localId);
    if (!row) return;
    const err = validateAttachmentFile(file, row.attachments.length, MAX_ATTACHMENTS_PER_TASK);
    if (err) { updateTask(localId, { attachError: err }); return; }
    // Loading state — the chip in AttachmentList picks this up immediately, before the network
    // round trip even starts.
    updateTask(localId, { attachError: null, uploadingFileName: file.name, uploadProgress: null });
    const onUploadFail = (err2: unknown) => updateTask(localId, {
      attachError: extractError(err2), uploadingFileName: null, uploadProgress: null,
    });
    withEntryId(id => {
      uploadMutation.mutate({
        file, entryId: id,
        onProgress: fraction => updateTask(localId, { uploadProgress: fraction }),
      }, {
        onSuccess: dto => {
          setTasks(prev => prev.map(t =>
            t.localId === localId
              ? { ...t, attachments: [...t.attachments, dto], uploadingFileName: null, uploadProgress: null }
              : t));
          // Success state — brief confirmation toast, on top of the new chip appearing in the list.
          toast(`"${dto.fileName}" attached`);
        },
        onError: onUploadFail,
      });
    }, onUploadFail);
  }

  function handleRemoveTaskAttachment(localId: string, attachmentId: number) {
    deleteAttachmentMutation.mutate(attachmentId, {
      onSuccess: () => setTasks(prev => prev.map(t =>
        t.localId === localId ? { ...t, attachments: t.attachments.filter(a => a.id !== attachmentId) } : t)),
      onError: err => updateTask(localId, { attachError: extractError(err) }),
    });
  }

  async function handlePreviewAttachment(attachment: EodAttachmentDto) {
    try {
      await previewEodAttachment(
        attachment,
        () => getEodAttachmentDataUrl(attachment.id),
        extractError,
      );
    } catch (err) {
      toast(extractError(err), 'error');
    }
  }

  // ── Client-side validation ────────────────────────────────────────────────

  function validate(): string[] {
    // A holiday or a leave day logs nothing, so every task and hours check is skipped
    // outright rather than satisfied with empty rows.
    if (isNonWorkDay) return [];

    const errs: string[] = [];

    // Required only when the field is actually enabled. A holiday and leave day both
    // disable and clear it, so demanding it there would make those days unsubmittable.
    if (!workLocDisabled && !workLocation) {
      errs.push('Work location is required.');
    }

    // Optional on a Weekend — adding an OT task doesn't turn it into a normal working day, and a
    // day off with nothing logged has no "tomorrow" to plan for either way.
    if (!isWeekend && !nextDayPlan.trim()) {
      errs.push('Next-day plan is required.');
    }

    // On a Weekend, task logging is optional overtime — a still-blank placeholder row (the
    // default row, or an untouched "Add task" click) isn't a task the employee actually logged,
    // so it's excluded here rather than forced through the same required-field checks below.
    // Every other day type is untouched: activeTasks === tasks.
    const activeTasks = isWeekend ? tasks.filter(t => !isTaskRowBlank(t)) : tasks;

    if (activeTasks.length === 0 && !isWeekend) {
      errs.push(isHalfLeave
        ? `At least one task row is required for ${HALF_LEAVE_LABELS[dayType]}.`
        : 'At least one task row is required for a working day.');
      return errs;
    }
    activeTasks.forEach((t, i) => {
      const n = i + 1;
      // A task row can still carry the "Leave" category on an otherwise Working day
      // (e.g. a few hours of leave taken during a working day) — unrelated to the
      // Day Type dropdown, so this per-row handling is unchanged.
      const leaveRow = t.categoryName === LEAVE;
      if (!t.taskCategoryId) errs.push(`Task ${n}: category is required.`);
      // Leave is not project work, so a project is required only on real work rows.
      if (!leaveRow && !t.projectId) errs.push(`Task ${n}: project is required.`);
      // Status now defaults to blank, so it has to be chosen. A leave row is forced to COMPLETED
      // and its select is disabled, so it never trips this.
      if (!t.taskStatus) errs.push(`Task ${n}: status is required.`);
      if (leaveRow && (t.projectId || t.taskStatus !== 'COMPLETED')) {
        errs.push(`Row #${n}: Leave rows cannot have a project set.`);
      }
      if (t.hours === '' || isNaN(parseFloat(t.hours))) errs.push(`Task ${n}: hours are required.`);
      if (parseFloat(t.hours) < 0) errs.push(`Task ${n}: hours cannot be negative.`);
      if (t.taskStatus === 'BLOCKED' && !t.blockerReason.trim()) {
        errs.push(`Task ${n}: blocker reason is required when status is Blocked.`);
      }
    });
    // Exceeding the day's EXPECTED hours is overtime, surfaced to the manager on submit, never a
    // reason to block. These are different: they bound what is plausible for a day. A half-day
    // leave's floor is half of dailyHoursCap rather than the flat MIN_HOURS_PER_DAY — OT hours
    // logged on top never lower it (see halfDayHoursCap above / EodService.validateLoggedDay). A
    // Weekend has no floor at all — anything logged there is pure overtime, never counted against
    // a minimum (mirrors EodService.validateLoggedDay skipping WEEKEND the same way it already
    // skips LEAVE). A time adjustment's minutes count toward logged hours here too, same as the
    // "hrs expected" indicator and the backend's validateLoggedDay — effectiveLoggedHours, not
    // the raw task-only totalHours.
    const requiredMinHours = isHalfLeave ? halfDayHoursCap : MIN_HOURS_PER_DAY;
    if (!isWeekend && effectiveLoggedHours < requiredMinHours - 0.001) {
      errs.push(isHalfLeave
        ? `Minimum ${requiredMinHours.toFixed(1)} hours required for ${HALF_LEAVE_LABELS[dayType]} - you've logged ${effectiveLoggedHours.toFixed(2)} hours.`
        : `Total hours (${effectiveLoggedHours.toFixed(2)}) must be at least ${MIN_HOURS_PER_DAY} for a single day.`);
    }
    if (effectiveLoggedHours > MAX_HOURS_PER_DAY + 0.001) {
      errs.push(`Total hours (${effectiveLoggedHours.toFixed(2)}) cannot exceed ${MAX_HOURS_PER_DAY} for a single day.`);
    }
    errs.push(...validateAdjustment());
    return errs;
  }

  function validateAdjustment(): string[] {
    if (!canRequestAdj || !adjEnabled) return [];
    const errs: string[] = [];
    if (!adjType) {
      errs.push('Select a time adjustment type (Late arrival, Intervening time-off, or Leaving early).');
      return errs;
    }
    const label = ADJ_TYPES.find(t => t.value === adjType)?.label ?? 'Time adjustment';
    if (adjMins <= 0) {
      errs.push('Enter a valid duration for this time adjustment.');
      return errs;
    }
    if (adjMins < MIN_ADJ_MINUTES || adjMins > MAX_ADJ_MINUTES) {
      errs.push(`${label} must be between 30 minutes and 2 hours (got ${adjMins} minutes).`);
    }
    if (shiftMins > 0 && adjMins > shiftMins) {
      errs.push(`Time adjustment minutes (${adjMins}) cannot exceed the shift length (${shiftMins} minutes).`);
    }
    // One shared pool, so the test is whether THIS duration still fits in what is left —
    // mirrors EodService.validateTimeAdjustment.
    if (adjMins > adjRemaining) {
      errs.push(
        `${label} of ${minutesLabel(adjMins)} exceeds your monthly time adjustment budget - `
        + `${minutesLabel(adjRemaining)} of ${minutesLabel(adjBudget)} left this month.`,
      );
    }
    return errs;
  }

  // ── Action handlers ───────────────────────────────────────────────────────

  function buildRequest() {
    return {
      entryDate:    selectedDate,
      dayType,
      // Only ever sent on a working day with a shift; the server clears it otherwise anyway.
      timeAdjustmentType:    adjActive ? adjType  : null,
      timeAdjustmentMinutes: adjActive ? adjMins  : null,
      // Never send a location the day type doesn't allow. The server also nulls it for a
      // holiday, but sending it would be a lie about what the form showed.
      workLocation: workLocDisabled ? null : (workLocation || null),
      nextDayPlan:  nextDayPlan  || null,
      remarks:      remarks      || null,
      // A holiday or leave day carries no rows at all; the server discards any it receives anyway.
      // On a Weekend, a still-blank placeholder row is not a task the employee logged (see
      // isTaskRowBlank/activeTasks in validate()) — dropped here too so an untouched Add-task
      // row doesn't get submitted as an empty task.
      tasks: isNonWorkDay ? [] : (isWeekend ? tasks.filter(t => !isTaskRowBlank(t)) : tasks).map(t => ({
        projectId:      t.projectId,
        taskCategoryId: t.taskCategoryId,
        description:    t.description || null,
        hours:          parseFloat(t.hours) || 0,
        taskStatus:     t.taskStatus || null, // '' would fail enum parsing server-side
        blockerReason:  t.blockerReason || null,
        supportNeeded:  t.supportNeeded || null,
        attachmentIds:  t.attachments.map(a => a.id),
      })),
      // No EOD-level attachment area anymore — every attachment is scoped to a task row.
      attachmentIds: [],
    };
  }

  function handleSaveDraft() {
    setErrors([]);
    // Toast lives here rather than on the mutation so it only fires for an explicit Save draft,
    // not for the save that Submit performs on the way through.
    draftMutation.mutate(buildRequest(), {
      onSuccess: () => toast('Draft saved'),
    });
  }

  function handleSubmit() {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    // Always persist the current in-memory edits first — submitEntry() sends no body and
    // validates whatever is already in the database, so skipping this when entryId already
    // exists would submit stale rows instead of what's on screen (e.g. a just-picked project).
    draftMutation.mutate(buildRequest(), {
      onSuccess: (entry) => submitMutation.mutate(entry.id),
    });
  }

  // ── Task row mutators ─────────────────────────────────────────────────────

  function updateTask(localId: string, patch: Partial<TaskRow>) {
    setTasks(prev => prev.map(t => t.localId === localId ? { ...t, ...patch } : t));
  }

  function addTask() {
    setTasks(prev => [...prev, newRow()]);
  }

  function removeTask(localId: string) {
    // Clean up this row's own attachments too — otherwise they'd survive as EOD-level orphans
    // once this task's underlying row is gone (see reassignForSave's ON DELETE SET NULL note).
    const row = tasks.find(t => t.localId === localId);
    row?.attachments.forEach(a => deleteAttachmentMutation.mutate(a.id));
    // Unlike Working Day (always >= 1 row, enforced by canRemove below), Weekend has no minimum
    // task requirement — removing its only row would otherwise leave `tasks` empty, so it's
    // replaced with a fresh blank placeholder instead (same shape the day starts in).
    const remaining = tasks.filter(t => t.localId !== localId);
    setTasks(remaining.length > 0 ? remaining : [newRow()]);
    // No real row left (either none remain, or what's left is still just blank placeholders) —
    // collapse back to the default "no tasks required" Weekend state rather than showing an
    // empty/blank Tasks section.
    if (isWeekend && remaining.every(t => isTaskRowBlank(t))) {
      setWeekendExpanded(false);
    }
  }

  function handleCategoryChange(localId: string, catId: string) {
    const id = catId ? Number(catId) : null;
    const cat = id ? catMap.get(id) : null;
    const isLeave = cat?.name === LEAVE;
    updateTask(localId, {
      taskCategoryId:   id,
      categoryName:     cat?.name ?? null,
      // Leave is not project work, so no project and always complete. Mirrored server-side
      // in EodService.buildTask, which is what actually enforces it.
      ...(isLeave
        ? { projectId: null, projectCode: null, taskStatus: 'COMPLETED' }
        : {}),
      // Leave rows now carry real hours (8 full day, 4 half day), so no longer forced to 0.
      hours: '',
    });
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loadingProjects || loadingCategories) {
    return (
      <div style={{ maxWidth: 860 }}>
        <PageHeader selectedDate={selectedDate} onDateChange={handleDateChange} entryStatus={null} />
        <GlobalLoader fullScreen={false} label="Loading EOD form..." />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Page header */}
      <PageHeader
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        entryStatus={entryStatus}
      />

      {/* Reviewer feedback banner */}
      {reviewerComment && entryStatus === 'REJECTED' && (
        <div style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '12px 16px', borderRadius: 8, marginTop: 20,
          background: entryStatus === 'REJECTED'
            ? 'rgba(228,55,61,.08)' : 'rgba(224,169,59,.08)',
          border: `1px solid ${entryStatus === 'REJECTED' ? 'rgba(228,55,61,.3)' : 'rgba(224,169,59,.3)'}`,
        }}>
          <AlertTriangle size={15} style={{ color: entryStatus === 'REJECTED' ? '#E4373D' : '#E0A93B', flexShrink: 0, marginTop: 1 }} aria-hidden />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: entryStatus === 'REJECTED' ? '#E4373D' : '#E0A93B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {entryStatus === 'REJECTED' ? 'Rejected' : 'Changes Requested'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.5 }}>{reviewerComment}</div>
          </div>
        </div>
      )}

      {/* Submitted/Approved banner — a clarification request gets its own explanatory variant,
          same lock (isReadOnly), just a different reason shown. */}
      {isReadOnly && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 16px', borderRadius: 8, marginTop: 20,
          background: entryStatus === 'APPROVED' ? 'rgba(47,182,124,.08)'
            : hasOpenClarification ? 'rgba(224,169,59,.08)' : 'rgba(76,141,214,.08)',
          border: `1px solid ${entryStatus === 'APPROVED' ? 'rgba(47,182,124,.3)'
            : hasOpenClarification ? 'rgba(224,169,59,.3)' : 'rgba(76,141,214,.3)'}`,
        }}>
          {entryStatus === 'APPROVED'
            ? <CheckCircle size={14} style={{ color: '#2FB67C', flexShrink: 0 }} aria-hidden />
            : hasOpenClarification
              ? <MessageCircleQuestion size={14} style={{ color: '#E0A93B', flexShrink: 0 }} aria-hidden />
              : <Clock size={14} style={{ color: '#4C8DD6', flexShrink: 0 }} aria-hidden />}
          <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            {entryStatus === 'APPROVED'
              ? 'This report has been approved. No changes can be made.'
              : hasOpenClarification
                ? `Your Team Lead requested clarification on this report — it can't be edited until resolved.`
                : 'This report has been submitted and is awaiting review.'}
          </span>
          {hasOpenClarification && entryId != null && (
            <Link
              to={`/employee/eod-inbox?highlight=${entryId}`}
              style={{
                marginLeft: 'auto', flexShrink: 0, fontSize: 12.5, fontWeight: 600,
                color: '#E0A93B', textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              Reply in EOD Inbox →
            </Link>
          )}
        </div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div ref={errorRef} style={{
          padding: '12px 16px', borderRadius: 8, marginTop: 20,
          background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.25)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--risk)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Fix before submitting
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {errors.map((e, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--risk)', lineHeight: 1.6 }}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Loading entry spinner */}
      {formLoading && (
        <GlobalLoader fullScreen={false} compact label="Loading entry..." />
      )}

      {/* Form body */}
      {!formLoading && (
        <>
          {/* Meta row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 24 }}>
            <div>
              <Label>Entry date</Label>
              {isDateLocked ? (
                <div style={{ ...inputStyle, opacity: 0.7 }}>{formatDate(selectedDate)}</div>
              ) : (
                <DatePicker
                  value={selectedDate}
                  onChange={handleDateChange}
                  max={todayISO()}
                  inputStyle={inputStyle}
                />
              )}
            </div>
            <div>
              <Label>Day type <Req /></Label>
              {isReadOnly ? (
                <div style={{ ...inputStyle, opacity: 0.7 }}>
                  {DAY_TYPES.find(d => d.value === dayType)?.label ?? dayType}
                </div>
              ) : (
                <Sel value={dayType} onChange={e => handleDayTypeChange(e.target.value)}>
                  {DAY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Sel>
              )}
            </div>
            <div>
              {/* Marked required only while it is enabled — a holiday or full-day leave has no
                  work location, so the asterisk would be a lie there. */}
              <Label>Work location {!workLocDisabled && <Req />}</Label>
              {isReadOnly ? (
                <div style={{ ...inputStyle, opacity: 0.7 }}>{workLocation || '-'}</div>
              ) : (
                <Sel
                  value={workLocDisabled ? '' : workLocation}
                  onChange={e => setWorkLocation(e.target.value)}
                  disabled={workLocDisabled}
                >
                  <option value="">Work Location</option>
                  {WORK_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </Sel>
              )}
            </div>
          </div>

          {/* Read-only recap of an adjustment already on the entry. The editable block below is
              gated on isEditable, so without this a submitted/approved day showed no trace of the
              adjustment at all — even though it is what reduced the expected hours. */}
          {isReadOnly && adjType && adjMins > 0 && (
            <div style={{
              marginTop: 20, padding: '14px 18px', borderRadius: 8,
              background: 'rgba(76,141,214,.08)', border: '1px solid rgba(76,141,214,.3)',
            }}>
              <Label>Time adjustment</Label>
              <div style={{ fontSize: 13, color: 'var(--txt)', marginTop: 2 }}>
                {ADJ_TYPES.find(t => t.value === adjType)?.label ?? 'Time adjustment'}
                {' · '}
                <span>{minutesLabel(adjMins)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 6 }}>
                {adjBanner()}
              </div>
              {/* Says out loud that the adjustment counts toward logged hours, not toward a
                  bigger target — the target itself never moves for an adjustment. */}
              <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 4 }}>
                {minutesLabel(adjMins)} counted toward this day's logged hours - the {expectedHrs.toFixed(1)}h target is unchanged.
              </div>
            </div>
          )}

          {/* Time adjustment — a partial-day schedule shift on a working day. Hidden entirely
              for Leave/Holiday, and when no shift is assigned (nothing to compute from). */}
          {canRequestAdj && isEditable && (
            <>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 20,
                cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={adjEnabled}
                  onChange={e => handleAdjToggle(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--brand)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
                  Request a time adjustment for today (late arrival, early leave, or time away mid-shift)
                </span>
              </label>

              {adjEnabled && (
                <div style={{
                  marginTop: 12, padding: '16px 18px', borderRadius: 8,
                  background: 'rgba(76,141,214,.08)', border: '1px solid rgba(76,141,214,.3)',
                }}>
                  {/* Shift timings — read-only, from the existing shift assignment */}
                  <Label>Shift timings</Label>
                  <div style={{ fontSize: 13, color: 'var(--txt)', marginBottom: 4 }}>
                    {adjContext?.shiftStart && adjContext?.shiftEnd
                      ? `${formatTime12h(adjContext.shiftStart)} – ${formatTime12h(adjContext.shiftEnd)}`
                      : '-'}
                    {adjContext?.shiftName && (
                      <span style={{ color: 'var(--txt-dim)', fontFamily: 'inherit' }}> · {adjContext.shiftName}</span>
                    )}
                  </div>
                  {/* Spells out why expected hours come off the configured cap and not the longer span. */}
                  <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 14 }}>
                    {(shiftMins / 60).toFixed(0)}h rostered
                    {breakMins > 0 && ` · ${breakMins}m unpaid break`}
                    {' '}· {dailyHoursCap} working hours
                  </div>

                  {/* Mutually exclusive types. The budget is one shared pool, so when it is spent
                      every type is unavailable — not just the one it was spent on. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 14 }}>
                    {ADJ_TYPES.map(t => (
                      <label
                        key={t.value}
                        title={adjExhausted ? 'Monthly time adjustment budget fully used' : undefined}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7, fontSize: 13,
                          cursor: adjExhausted ? 'not-allowed' : 'pointer',
                          opacity: adjExhausted ? 0.5 : 1,
                          color: adjType === t.value ? 'var(--txt)' : 'var(--txt-mut)',
                          fontWeight: adjType === t.value ? 600 : 400,
                        }}
                      >
                        <input
                          type="radio"
                          name="timeAdjType"
                          checked={adjType === t.value}
                          disabled={adjExhausted}
                          onChange={() => handleAdjTypeChange(t.value)}
                          style={{ width: 'auto', accentColor: 'var(--info)', cursor: adjExhausted ? 'not-allowed' : 'pointer' }}
                        />
                        <span>{t.label}</span>
                      </label>
                    ))}
                    {adjExhausted && (
                      <span style={{ fontSize: 11, color: 'var(--warn)', alignSelf: 'center' }}>
                        Monthly budget fully used ({minutesLabel(adjUsedMins)} of {minutesLabel(adjBudget)})
                      </span>
                    )}
                  </div>

                  {/* Duration — 30 minutes to 2 hours, further capped by what is left in the pool
                      so an unaffordable option cannot be picked at all. Server re-validates. */}
                  {adjType && (
                    <div style={{ maxWidth: 240, marginBottom: 14 }}>
                      <Label>{ADJ_TYPES.find(t => t.value === adjType)?.durationLabel}</Label>
                      <Sel value={adjMinutes} onChange={e => { setAdjMinutes(e.target.value); setErrors([]); }}>
                        <option value="">Select Time</option>
                        {ADJ_MINUTE_OPTIONS.filter(m => m <= adjRemaining).map(m => (
                          <option key={m} value={m}>{minutesLabel(m)}</option>
                        ))}
                      </Sel>
                      {/* The shortest adjustment is 30 minutes, so a smaller remainder buys nothing. */}
                      {adjRemaining < MIN_ADJ_MINUTES && !adjExhausted && (
                        <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 6 }}>
                          Only {minutesLabel(adjRemaining)} left this month - below the {MIN_ADJ_MINUTES}-minute minimum.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Live calculated impact */}
                  <div style={{
                    padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
                    background: 'rgba(76,141,214,.08)', border: '1px solid rgba(76,141,214,.3)',
                    color: 'var(--info)',
                  }}>
                    {adjBanner()}
                  </div>

                  {/* Real usage for the entry's calendar month — not a placeholder */}
                  <button
                    type="button"
                    onClick={() => setShowBalance(s => !s)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, color: 'var(--info)', borderBottom: '1px dashed var(--line2)',
                    }}
                  >
                    View available balance
                  </button>
                  {showBalance && (
                    <div style={{
                      marginTop: 10, padding: '10px 12px', borderRadius: 6, fontSize: 12,
                      background: 'var(--raised2)', border: '1px solid var(--line2)',
                      color: 'var(--txt-mut)', display: 'flex', flexWrap: 'wrap', gap: 16,
                    }}>
                      <span>
                        Used this month:{' '}
                        <strong style={{ color: 'var(--txt)' }}>
                          {minutesLabel(adjUsedMins)} of {minutesLabel(adjBudget)}
                        </strong>
                      </span>
                      <span>
                        Remaining:{' '}
                        <strong style={{ color: adjExhausted ? 'var(--warn)' : 'var(--ok)' }}>
                          {minutesLabel(adjRemaining)}
                        </strong>
                      </span>
                      {/* Says out loud that the pool is shared — the previous per-type rows
                          implied three separate budgets. */}
                      <span style={{ flexBasis: '100%', color: 'var(--txt-dim)' }}>
                        Shared across late arrival, intervening time-off and leaving early.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Holiday, Leave and Weekend — nothing REQUIRED to log, so this banner always shows
              for them. Holiday/Leave also replace the whole Tasks section with this (see
              isNonWorkDay below); a Weekend keeps the Tasks section too, so the Add-task button
              stays available right underneath for optional overtime logging. Reuses the same
              banner shape and the existing --ok role as the approved banner above; no new colors. */}
          {(isNonWorkDay || isWeekend) && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '12px 16px', borderRadius: 8, marginTop: 28,
              background: 'rgba(47,182,124,.08)', border: '1px solid rgba(47,182,124,.3)',
            }}>
              <CheckCircle size={15} style={{ color: 'var(--ok)', flexShrink: 0, marginTop: 1 }} aria-hidden />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok)', marginBottom: 2 }}>
                  No tasks required
                </div>
                <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5 }}>
                  {isHoliday
                    ? 'This is a company holiday. Hours and project fields are skipped.'
                    : isLeaveDay
                      ? 'You are on leave. Hours and project fields are skipped.'
                      : 'This is a weekend day. If you worked today, add a task below to log it as overtime.'}
                </div>
              </div>
            </div>
          )}

          {/* Tasks section. On a Weekend, the row fields stay hidden behind the same "Add task"
              button (no separate/simplified OT-only control) until the employee clicks it or a
              real row already exists (showWeekendTaskRows) — Holiday/Leave still hide the whole
              section outright via isNonWorkDay. A read-only Weekend entry with nothing logged
              renders neither the button nor an empty section, same as a read-only Holiday/Leave. */}
          {!isNonWorkDay && (isEditable || !isWeekend || showWeekendTaskRows) && (
          <div style={{ marginTop: 28 }}>
            {isWeekend && !showWeekendTaskRows ? (
              <AddTaskButton onClick={() => setWeekendExpanded(true)} />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Tasks
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Overtime is informational — it never blocks submitting. */}
                    {hasOvertime && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)' }}>
                        +{overtimeHrs.toFixed(1)} hrs overtime
                      </span>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
                      {/* Numerator: task hours + an active adjustment's minutes, in "H.MM" notation
                          (45 minutes → ".45", NOT decimal-hours ".75") — never decimal math when an
                          adjustment is active. Denominator: the fixed target, plain decimal, never
                          touched by the adjustment. */}
                      <span style={{ color: 'var(--txt)', fontWeight: 600 }}>
                        {adjActive ? formatHrsMinutes(totalMinutesLogged) : totalHours.toFixed(1)}
                      </span>
                      {' '}/ {expectedHrs.toFixed(1)}
                      {' '}hrs {adjActive ? 'expected' : 'total'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tasks.map((task, idx) => (
                    <TaskCard
                      key={task.localId}
                      task={task}
                      index={idx}
                      projects={projects}
                      categories={categories}
                      isReadOnly={isReadOnly}
                      onUpdate={patch => updateTask(task.localId, patch)}
                      onRemove={() => removeTask(task.localId)}
                      onCategoryChange={catId => handleCategoryChange(task.localId, catId)}
                      // Working Day (and Half Leave) always need >= 1 task row, so removal is
                      // blocked at the last one. Weekend has no such minimum — its only row can
                      // always be removed, collapsing the section back to the default state
                      // (handled in removeTask above).
                      canRemove={isWeekend || tasks.length > 1}
                      onFileSelected={e => handleTaskFileSelected(task.localId, e)}
                      onPreviewAttachment={handlePreviewAttachment}
                      onRemoveAttachment={attachmentId => handleRemoveTaskAttachment(task.localId, attachmentId)}
                    />
                  ))}
                </div>

                {isEditable && <AddTaskButton onClick={addTask} style={{ marginTop: 10 }} />}
              </>
            )}
          </div>
          )}

          {/* Next-day plan — required everywhere except Weekend, where it stays optional even
              once an OT task is added (see the matching skip in validate()). */}
          <div style={{ marginTop: 24 }}>
            <Label>Next-day plan {!isWeekend && <Req />}</Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity: 0.7, minHeight: 60, lineHeight: 1.5 }}>{nextDayPlan || '-'}</div>
              : <>
                  <Txt value={nextDayPlan} onChange={e => setNextDayPlan(e.target.value)} placeholder="What are you planning to work on tomorrow?" rows={3} maxLength={MAX_TEXT_LEN} />
                  <CharCount value={nextDayPlan} />
                </>}
          </div>

          {/* Remarks */}
          <div style={{ marginTop: 16 }}>
            <Label>Remarks</Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity: 0.7, minHeight: 50, lineHeight: 1.5 }}>{remarks || '-'}</div>
              : <>
                  <Txt value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any blockers, dependencies, or context for your manager?" rows={2} maxLength={MAX_TEXT_LEN} />
                  <CharCount value={remarks} />
                </>}
          </div>

          {/* Action buttons */}
          {isEditable && (
            <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: 'flex-end' }}>
              <button
                onClick={handleSaveDraft}
                disabled={draftMutation.isPending || submitMutation.isPending}
                style={{
                  padding: '9px 20px', borderRadius: 6,
                  background: 'var(--raised2)', border: '1px solid var(--line2)',
                  color: 'var(--txt)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  opacity: draftMutation.isPending ? 0.6 : 1,
                }}
              >
                {draftMutation.isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={draftMutation.isPending || submitMutation.isPending}
                style={{
                  padding: '9px 22px', borderRadius: 6,
                  background: 'var(--brand)', border: '1px solid var(--brand-deep)',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: submitMutation.isPending ? 0.6 : 1,
                  boxShadow: '0 2px 8px color-mix(in srgb, var(--brand) 35%, transparent)',
                }}
              >
                {submitMutation.isPending ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Page header subcomponent ──────────────────────────────────────────────────

function PageHeader({
  selectedDate,
  entryStatus,
}: {
  selectedDate: string;
  onDateChange?: (d: string) => void;
  entryStatus: string | null;
}) {
  // Weekday kept (useful context for "which day am I submitting EOD for"),
  // date portion standardized to DD-MM-YYYY.
  const weekday = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
  const formatted = `${weekday}, ${formatDate(selectedDate)}`;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', background: 'var(--raised2)', border: '1px solid var(--line2)',
          borderRadius: 20, marginBottom: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4C8DD6', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.04em' }}>Employee</span>
        </div>
        <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
          End-of-Day Report
        </h1>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--txt-mut)' }}>{formatted}</div>
      </div>
      {entryStatus && <StatusBadge status={entryStatus} />}
    </div>
  );
}

// ── Task card subcomponent ─────────────────────────────────────────────────────

interface TaskCardProps {
  task: TaskRow;
  index: number;
  projects: { id: number; code: string; name: string; client: string | null }[];
  categories: { id: number; name: string; isProductive: boolean }[];
  isReadOnly: boolean;
  onUpdate: (patch: Partial<TaskRow>) => void;
  onRemove: () => void;
  onCategoryChange: (catId: string) => void;
  canRemove: boolean;
  onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onPreviewAttachment: (attachment: EodAttachmentDto) => void;
  onRemoveAttachment: (attachmentId: number) => void;
}

function TaskCard({
  task, index, projects, categories, isReadOnly, onUpdate, onRemove, onCategoryChange, canRemove,
  onFileSelected, onPreviewAttachment, onRemoveAttachment,
}: TaskCardProps) {
  // A leave row has no project and is always Completed — those two fields are locked.
  // Hours stay editable (8 full day, 4 half day).
  const isLeave   = task.categoryName === LEAVE;
  const isBlocked = task.taskStatus === 'BLOCKED';

  const statusColor: Record<string, string> = {
    COMPLETED:   '#2FB67C',
    IN_PROGRESS: '#4C8DD6',
    BLOCKED:     '#E4373D',
    NOT_STARTED: '#9BA1AC',
  };

  return (
    <div style={{
      background: 'var(--raised)', border: '1px solid var(--line)',
      borderRadius: 8, padding: '14px 16px',
      borderLeft: `3px solid ${statusColor[task.taskStatus] ?? 'var(--line)'}`,
    }}>
      {/* Task header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--txt-dim)', flexShrink: 0 }}>
          #{index + 1}
        </span>
        <div className="nf-eod-task-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto auto', gap: 8, alignItems: 'end' }}>
          {/* Project */}
          <div>
            <Label>Project</Label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, fontSize: 12 }}>
                {task.projectCode ?? projects.find(p => p.id === task.projectId)?.code ?? '-'}
              </div>
            ) : (
              <Sel
                value={isLeave ? '' : (task.projectId ?? '')}
                onChange={e => {
                  const nextId = e.target.value ? Number(e.target.value) : null;
                  onUpdate({ projectId: nextId });
                }}
                disabled={isLeave}
              >
                <option value="">Project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
                {/* Saved project that is no longer in this user's allocations — keep it selectable
                    so reopening a draft doesn't silently blank the field on the next save. */}
                {task.projectId != null && !projects.some(p => p.id === task.projectId) && (
                  <option value={task.projectId}>
                    {task.projectCode ?? `Project #${task.projectId}`} (no longer allocated)
                  </option>
                )}
              </Sel>
            )}
          </div>
          {/* Category */}
          <div>
            <Label>Category</Label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, fontSize: 12 }}>{task.categoryName ?? '-'}</div>
            ) : (
              <Sel value={task.taskCategoryId ?? ''} onChange={e => onCategoryChange(e.target.value)}>
                <option value="">Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Sel>
            )}
          </div>
          {/* Hours */}
          <div>
            <Label>Hours</Label>
            <Inp
              type="number"
              min={0}
              step={0.5}
              value={task.hours}
              onChange={e => onUpdate({ hours: e.target.value })}
              disabled={isReadOnly}
              placeholder="0"
            />
          </div>
          {/* Status */}
          <div>
            <Label>Status <Req /></Label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, fontSize: 12, color: statusColor[task.taskStatus] ?? 'var(--txt)' }}>
                {/* An unset status must not echo the dropdown's own placeholder back as a value. */}
                {task.taskStatus
                  ? TASK_STATUSES.find(s => s.value === task.taskStatus)?.label ?? task.taskStatus
                  : '-'}
              </div>
            ) : (
              <Sel
                value={isLeave ? 'COMPLETED' : task.taskStatus}
                onChange={e => onUpdate({ taskStatus: e.target.value })}
                disabled={isLeave}
              >
                {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Sel>
            )}
          </div>
          {/* Remove */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!isReadOnly && canRemove && (
              <button
                onClick={onRemove}
                title="Remove task"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 2, display: 'flex', alignSelf: 'flex-end' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#E4373D')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--txt-dim)')}
              >
                <Trash2 size={13} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: isBlocked ? 10 : 0 }}>
        <Label>Description</Label>
        {isReadOnly
          ? <div style={{ ...inputStyle, opacity: 0.7, lineHeight: 1.5 }}>{task.description || '-'}</div>
          : <>
              <Txt value={task.description} onChange={e => onUpdate({ description: e.target.value })} rows={2} placeholder="What did you work on?" maxLength={MAX_TEXT_LEN} style={{ minHeight: 54 }} />
              <CharCount value={task.description} />
            </>}
      </div>

      {/* Attachment — the single place to upload documents/images for this specific task row.
          Once the report is read-only, a task with nothing attached shows no Attachment field
          at all rather than an empty, unusable upload control. */}
      {(!isReadOnly || task.attachments.length > 0) && (
        <div style={{ marginTop: 10 }}>
          <Label>Attachment</Label>
          <AttachmentList
            attachments={task.attachments}
            onPreview={onPreviewAttachment}
            onRemove={onRemoveAttachment}
            readOnly={isReadOnly}
            uploadingFileName={task.uploadingFileName}
            uploadProgress={task.uploadProgress}
          />
          {task.attachError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--risk)', marginBottom: 6 }}>
              <AlertTriangle size={11} aria-hidden="true" style={{ flexShrink: 0 }} />
              {task.attachError}
            </div>
          )}
          {!isReadOnly && !task.uploadingFileName && task.attachments.length < MAX_ATTACHMENTS_PER_TASK && (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6,
              background: 'transparent', border: '1px dashed var(--line2)', color: 'var(--txt-mut)',
              fontSize: 12, cursor: 'pointer',
            }}>
              <Paperclip size={12} aria-hidden="true" />
              Attach file
              <input
                type="file"
                accept={ALLOWED_ATTACHMENT_TYPES.join(',')}
                onChange={onFileSelected}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      )}

      {/* Blocker reason — only for BLOCKED status */}
      {isBlocked && (
        <div style={{ marginTop: 10 }}>
          <Label>
            <span style={{ color: '#E4373D' }}>Blocker reason</span>
            <span style={{ color: '#E4373D', marginLeft: 3 }}>*</span>
          </Label>
          {isReadOnly
            ? <div style={{ ...inputStyle, opacity: 0.7, lineHeight: 1.5, borderColor: 'rgba(228,55,61,.3)' }}>{task.blockerReason || '-'}</div>
            : <>
                <Txt
                  value={task.blockerReason}
                  onChange={e => onUpdate({ blockerReason: e.target.value })}
                  rows={2}
                  placeholder="Describe what is blocking you and what support you need"
                  maxLength={MAX_TEXT_LEN}
                  style={{ minHeight: 54, borderColor: 'rgba(228,55,61,.35)' }}
                />
                <CharCount value={task.blockerReason} />
              </>}
        </div>
      )}
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────────────────────

function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string; message?: string } } }).response?.data;
    return data?.error ?? data?.message ?? 'Something went wrong';
  }
  return 'Something went wrong';
}
