import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { todayISO, formatDate, formatTime12h } from '../../lib/date';
import { listProjects } from '../../api/projects';
import { listTaskCategories } from '../../api/taskCategories';
import { saveDraft, submitEntry, listEntries, getTimeAdjustmentContext } from '../../api/eod';
import { DatePicker } from '../../components/DatePicker';
import type { EodEntryDto, EodTaskDto } from '../../api/eod';

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

const DAY_TYPES = [
  { value: 'WORKING_DAY', label: 'Working day' },
  { value: 'LEAVE',       label: 'Leave' },
  { value: 'HOLIDAY',     label: 'Holiday' },
];

/**
 * Reference cap for the live "x / y hrs" readout and instant client-side feedback.
 * The BACKEND is authoritative and reads business_rule_config.standard_hours_per_day;
 * that config is behind /api/admin/business-rules which is SUPERADMIN-only, so an
 * employee cannot fetch it. If an admin moves it off 8, this preview drifts until the
 * server rejects with the real number.
 */
const DAILY_HOURS_CAP = 8;

/**
 * Hard bounds for one day's logged hours, both inclusive. Distinct from DAILY_HOURS_CAP above,
 * which is only a reference — going over THAT is overtime and allowed. These bound what is
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
 * Identifies a specific version of the server's entry for a date. Used to decide whether the
 * form still reflects what the server last said. `updatedAt` moves on every server-side change,
 * so a manager's reject produces a different signature and forces the form to re-populate.
 */
function entrySignature(date: string, entry?: EodEntryDto | null): string {
  return entry ? `${date}|${entry.id}|${entry.status}|${entry.updatedAt}` : `${date}|none`;
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
  isBillable: boolean;
  blockerReason: string;
  supportNeeded: string;
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
    isBillable:       true,
    blockerReason:    '',
    supportNeeded:    '',
  };
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
    taskStatus:       dto.taskStatus ?? 'COMPLETED',
    isBillable:       dto.isBillable ?? true,
    blockerReason:    dto.blockerReason ?? '',
    supportNeeded:    dto.supportNeeded ?? '',
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function SubmitEOD() {
  useAuth(); // ensures protected route; user identity carried by JWT
  const { show: toast } = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // Date selector
  const [selectedDate, setSelectedDate] = useState<string>(() => searchParams.get('date') ?? todayISO());

  // Entry state — updated from backend responses
  const [, setEntryId] = useState<number | null>(null);
  const [entryStatus, setEntryStatus] = useState<string | null>(null);

  // Form fields
  const [dayType,      setDayType]      = useState('WORKING_DAY');
  const [workLocation, setWorkLocation] = useState('');
  const [nextDayPlan,  setNextDayPlan]  = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [tasks,        setTasks]        = useState<TaskRow[]>([newRow()]);
  const [reviewerComment, setReviewerComment] = useState<string | null>(null);

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
    if (loadingEntry) return;

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
    } else {
      setEntryId(null);
      setEntryStatus(null);
      setDayType('WORKING_DAY');
      setAdjEnabled(false);
      setAdjType(null);
      setAdjMinutes('');
      setWorkLocation('');
      setNextDayPlan('');
      setRemarks('');
      setReviewerComment(null);
      setTasks([newRow()]);
    }
    setErrors([]);
  }, [entries, loadingEntry, selectedDate, categories]);

  // Clear the applied signature when the date changes so the next query result repopulates
  function handleDateChange(d: string) {
    appliedRef.current = null;
    setSelectedDate(d);
    setErrors([]);
  }

  function handleDayTypeChange(next: string) {
    setDayType(next);
    // Neither a holiday nor an as-yet-workless leave day carries a work location.
    if (next !== 'WORKING_DAY') setWorkLocation('');
    // A time adjustment only exists on a working day — leaving one behind would submit an
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
  const totalHours   = tasks.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0);
  const catMap       = new Map(categories.map(c => [c.id, c]));

  const isHoliday  = dayType === 'HOLIDAY';
  const isLeaveDay = dayType === 'LEAVE';
  /** At least one row is real work rather than leave. */
  const hasWorkRow = tasks.some(t => t.categoryName !== LEAVE);
  // On a leave day, Work Location only makes sense if real work actually happened.
  // Derived rather than stored, so adding or removing a non-Leave row re-evaluates on the
  // very next render — no effect, no refetch, no resubmit.
  const workLocDisabled = isHoliday || (isLeaveDay && !hasWorkRow);

  // ── Time adjustment derived state ─────────────────────────────────────────
  const isWorkingDay  = dayType === 'WORKING_DAY';
  const shiftAssigned = adjContext?.shiftAssigned === true;
  // Without a shift there are no timings to compute "reach office by" or expectedHours from,
  // so the whole feature is unavailable rather than half-working.
  const canRequestAdj = isWorkingDay && shiftAssigned;
  const adjMins       = parseInt(adjMinutes, 10) || 0;
  const adjActive     = canRequestAdj && adjEnabled && adjType != null && adjMins > 0;

  /** Used vs allowance per type, straight from the backend counts. */
  const adjUsage: Record<string, { used: number; allowance: number }> = {
    LATE_ARRIVAL: { used: adjContext?.lateArrivalUsed ?? 0, allowance: adjContext?.lateArrivalAllowance ?? 0 },
    EARLY_LEAVE:  { used: adjContext?.earlyLeaveUsed  ?? 0, allowance: adjContext?.earlyLeaveAllowance  ?? 0 },
    INTERVENING:  { used: adjContext?.interveningUsed ?? 0, allowance: adjContext?.interveningAllowance ?? 0 },
  };
  function isExhausted(type: string): boolean {
    const u = adjUsage[type];
    return !!u && u.used >= u.allowance;
  }

  // Reference hours for the day. Based on the PAID WORKING DAY, not the shift span: a 15:30-00:30
  // shift spans 540 minutes but only 480 are work, the other 60 being an unpaid break that
  // shift_definition doesn't model. Deducting from the span would credit the break as work
  // (a 2-hour early leave would expect 7 hrs instead of 6). Either way this is a REFERENCE —
  // exceeding it is overtime, not an error. Mirrors EodService.applyOvertime.
  const shiftMins    = adjContext?.shiftDurationMinutes ?? 0;
  const expectedHrs  = adjActive ? Math.max(0, DAILY_HOURS_CAP - adjMins / 60) : DAILY_HOURS_CAP;
  /** Unpaid break implied by the gap between the rostered span and the paid working day. */
  const breakMins    = Math.max(0, shiftMins - DAILY_HOURS_CAP * 60);
  const overtimeHrs  = Math.max(0, totalHours - expectedHrs);
  const hasOvertime  = !isHoliday && overtimeHrs > 0.001;

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

  // ── Client-side validation ────────────────────────────────────────────────

  function validate(): string[] {
    // A holiday logs nothing, so every task and hours check is skipped outright rather
    // than satisfied with empty rows.
    if (isHoliday) return [];

    const errs: string[] = [];

    // Required only when the field is actually enabled. A holiday and a full-day leave both
    // disable and clear it, so demanding it there would make those days unsubmittable.
    if (!workLocDisabled && !workLocation) {
      errs.push('Work location is required.');
    }

    if (!nextDayPlan.trim()) {
      errs.push('Next-day plan is required.');
    }

    if (tasks.length === 0) {
      errs.push('At least one task row is required for a working/leave day.');
      return errs;
    }
    tasks.forEach((t, i) => {
      const n = i + 1;
      const leaveRow = t.categoryName === LEAVE;
      if (!t.taskCategoryId) errs.push(`Task ${n}: category is required.`);
      // Leave is not project work, so a project is required only on real work rows.
      if (!leaveRow && !t.projectId) errs.push(`Task ${n}: project is required.`);
      // Status now defaults to blank, so it has to be chosen. A leave row is forced to COMPLETED
      // and its select is disabled, so it never trips this.
      if (!t.taskStatus) errs.push(`Task ${n}: status is required.`);
      if (leaveRow && (t.projectId || t.isBillable || t.taskStatus !== 'COMPLETED')) {
        errs.push(`Row #${n}: Leave rows cannot have a project or billable flag set.`);
      }
      if (t.hours === '' || isNaN(parseFloat(t.hours))) errs.push(`Task ${n}: hours are required.`);
      if (parseFloat(t.hours) < 0) errs.push(`Task ${n}: hours cannot be negative.`);
      if (t.taskStatus === 'BLOCKED' && !t.blockerReason.trim()) {
        errs.push(`Task ${n}: blocker reason is required when status is Blocked.`);
      }
    });
    // Exceeding the day's EXPECTED hours is overtime, surfaced to the manager on submit, never a
    // reason to block. These are different: they bound what is plausible for a day.
    // Minimum applies to a working day only — on a leave day the hours are optional, since the
    // absence itself is the record. The maximum still applies to every day type.
    if (!isLeaveDay && totalHours < MIN_HOURS_PER_DAY - 0.001) {
      errs.push(`Total hours (${totalHours.toFixed(1)}) must be at least ${MIN_HOURS_PER_DAY} for a single day.`);
    }
    if (totalHours > MAX_HOURS_PER_DAY + 0.001) {
      errs.push(`Total hours (${totalHours.toFixed(1)}) cannot exceed ${MAX_HOURS_PER_DAY} for a single day.`);
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
    if (isExhausted(adjType)) {
      const u = adjUsage[adjType];
      errs.push(`${label}: monthly limit reached (${u.used} of ${u.allowance} used).`);
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
      // A holiday carries no rows at all; the server discards any it receives anyway.
      tasks: isHoliday ? [] : tasks.map(t => ({
        projectId:      t.projectId,
        taskCategoryId: t.taskCategoryId,
        description:    t.description || null,
        hours:          parseFloat(t.hours) || 0,
        taskStatus:     t.taskStatus || null, // '' would fail enum parsing server-side
        isBillable:     t.isBillable,
        blockerReason:  t.blockerReason || null,
        supportNeeded:  t.supportNeeded || null,
      })),
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
    setTasks(prev => prev.filter(t => t.localId !== localId));
  }

  function handleCategoryChange(localId: string, catId: string) {
    const id = catId ? Number(catId) : null;
    const cat = id ? catMap.get(id) : null;
    const isLeave = cat?.name === LEAVE;
    updateTask(localId, {
      taskCategoryId:   id,
      categoryName:     cat?.name ?? null,
      // Billable is not visible/editable by the employee (server-derived from project
      // eligibility), so changing category otherwise leaves it alone. Leave is the one
      // exception: it is not project work, so no project, never billable, always complete.
      // Mirrored server-side in EodService.buildTask, which is what actually enforces it.
      ...(isLeave
        ? { projectId: null, projectCode: null, isBillable: false, taskStatus: 'COMPLETED' }
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {[100, 80, 92].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 56, width: `${w}%`, borderRadius: 8 }} />
          ))}
        </div>
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

      {/* Submitted/Approved banner */}
      {isReadOnly && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 16px', borderRadius: 8, marginTop: 20,
          background: entryStatus === 'APPROVED' ? 'rgba(47,182,124,.08)' : 'rgba(76,141,214,.08)',
          border: `1px solid ${entryStatus === 'APPROVED' ? 'rgba(47,182,124,.3)' : 'rgba(76,141,214,.3)'}`,
        }}>
          {entryStatus === 'APPROVED'
            ? <CheckCircle size={14} style={{ color: '#2FB67C', flexShrink: 0 }} aria-hidden />
            : <Clock size={14} style={{ color: '#4C8DD6', flexShrink: 0 }} aria-hidden />}
          <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            {entryStatus === 'APPROVED'
              ? 'This report has been approved. No changes can be made.'
              : 'This report has been submitted and is awaiting review.'}
          </span>
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
      {loadingEntry && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[100, 75].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 40, width: `${w}%`, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {/* Form body */}
      {!loadingEntry && (
        <>
          {/* Meta row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 24 }}>
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
                <div style={{ ...inputStyle, opacity: 0.7 }}>{workLocation || '—'}</div>
              ) : (
                <Sel
                  value={workLocDisabled ? '' : workLocation}
                  onChange={e => setWorkLocation(e.target.value)}
                  disabled={workLocDisabled}
                >
                  <option value="">Work location</option>
                  {WORK_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </Sel>
              )}
            </div>
          </div>

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
                  <div style={{ fontSize: 13, color: 'var(--txt)', marginBottom: 4, fontFamily: '"JetBrains Mono", monospace' }}>
                    {adjContext?.shiftStart && adjContext?.shiftEnd
                      ? `${formatTime12h(adjContext.shiftStart)} – ${formatTime12h(adjContext.shiftEnd)}`
                      : '—'}
                    {adjContext?.shiftName && (
                      <span style={{ color: 'var(--txt-dim)', fontFamily: 'inherit' }}> · {adjContext.shiftName}</span>
                    )}
                  </div>
                  {/* Spells out why expected hours come off 8 and not the 9-hour span. */}
                  <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 14 }}>
                    {(shiftMins / 60).toFixed(0)}h rostered
                    {breakMins > 0 && ` · ${breakMins}m unpaid break`}
                    {' '}· {DAILY_HOURS_CAP} working hours
                  </div>

                  {/* Mutually exclusive types. One at its monthly limit cannot be picked. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 14 }}>
                    {ADJ_TYPES.map(t => {
                      const exhausted = isExhausted(t.value);
                      const u = adjUsage[t.value];
                      return (
                        <label
                          key={t.value}
                          title={exhausted ? `Monthly limit reached (${u.used} of ${u.allowance} used)` : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7, fontSize: 13,
                            cursor: exhausted ? 'not-allowed' : 'pointer',
                            opacity: exhausted ? 0.5 : 1,
                            color: adjType === t.value ? 'var(--txt)' : 'var(--txt-mut)',
                            fontWeight: adjType === t.value ? 600 : 400,
                          }}
                        >
                          <input
                            type="radio"
                            name="timeAdjType"
                            checked={adjType === t.value}
                            disabled={exhausted}
                            onChange={() => handleAdjTypeChange(t.value)}
                            style={{ width: 'auto', accentColor: 'var(--info)', cursor: exhausted ? 'not-allowed' : 'pointer' }}
                          />
                          <span>{t.label}</span>
                          {exhausted && (
                            <span style={{ fontSize: 11, color: 'var(--warn)' }}>
                              Monthly limit reached ({u.used} of {u.allowance} used)
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {/* Duration — same fixed dropdown for all three types, 30 minutes to 2 hours.
                      Server re-validates the range regardless. */}
                  {adjType && (
                    <div style={{ maxWidth: 240, marginBottom: 14 }}>
                      <Label>{ADJ_TYPES.find(t => t.value === adjType)?.durationLabel}</Label>
                      <Sel value={adjMinutes} onChange={e => { setAdjMinutes(e.target.value); setErrors([]); }}>
                        <option value="">— Select —</option>
                        {ADJ_MINUTE_OPTIONS.map(m => (
                          <option key={m} value={m}>{minutesLabel(m)}</option>
                        ))}
                      </Sel>
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
                      {ADJ_TYPES.map(t => (
                        <span key={t.value}>
                          {t.label} used this month:{' '}
                          <strong style={{ color: 'var(--txt)' }}>
                            {adjUsage[t.value].used} of {adjUsage[t.value].allowance}
                          </strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Holiday — nothing to log, so the whole Tasks section is replaced by this.
              Reuses the same banner shape and the existing --ok role as the approved
              banner above; no new colors. */}
          {isHoliday && (
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
                  This is a company holiday. Hours and project fields are skipped.
                </div>
              </div>
            </div>
          )}

          {/* Tasks section */}
          {!isHoliday && (
          <div style={{ marginTop: 28 }}>
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
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: 'var(--txt-mut)' }}>
                  <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{totalHours.toFixed(1)}</span>
                  {' '}/ {expectedHrs.toFixed(adjActive ? 2 : 1)}
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
                  canRemove={tasks.length > 1}
                />
              ))}
            </div>

            {isEditable && (
              <button
                onClick={addTask}
                style={{
                  marginTop: 10,
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6,
                  background: 'transparent', border: '1px dashed var(--line2)',
                  color: 'var(--txt-mut)', fontSize: 13, cursor: 'pointer',
                  transition: 'border-color 120ms, color 120ms',
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
            )}
          </div>
          )}

          {/* Next-day plan */}
          <div style={{ marginTop: 24 }}>
            <Label>Next-day plan <Req /></Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity: 0.7, minHeight: 60, lineHeight: 1.5 }}>{nextDayPlan || '—'}</div>
              : <Txt value={nextDayPlan} onChange={e => setNextDayPlan(e.target.value)} placeholder="What are you planning to work on tomorrow?" rows={3} />}
          </div>

          {/* Remarks */}
          <div style={{ marginTop: 16 }}>
            <Label>Remarks</Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity: 0.7, minHeight: 50, lineHeight: 1.5 }}>{remarks || '—'}</div>
              : <Txt value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any blockers, dependencies, or context for your manager?" rows={2} />}
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
                  boxShadow: '0 2px 8px rgba(177,17,22,.35)',
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
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
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
  projects: { id: number; code: string; name: string; client: string | null; billableAllowed: boolean }[];
  categories: { id: number; name: string; isProductive: boolean; isBillableDefault: boolean }[];
  isReadOnly: boolean;
  onUpdate: (patch: Partial<TaskRow>) => void;
  onRemove: () => void;
  onCategoryChange: (catId: string) => void;
  canRemove: boolean;
}

function TaskCard({ task, index, projects, categories, isReadOnly, onUpdate, onRemove, onCategoryChange, canRemove }: TaskCardProps) {
  // A leave row has no project, is never billable, and is always Completed — those three
  // fields are locked. Hours stay editable (8 full day, 4 half day).
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
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'var(--txt-dim)', flexShrink: 0 }}>
          #{index + 1}
        </span>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto auto', gap: 8, alignItems: 'end' }}>
          {/* Project */}
          <div>
            <Label>Project</Label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, fontSize: 12 }}>
                {task.projectCode ?? projects.find(p => p.id === task.projectId)?.code ?? '—'}
              </div>
            ) : (
              <Sel
                value={isLeave ? '' : (task.projectId ?? '')}
                onChange={e => {
                  const nextId = e.target.value ? Number(e.target.value) : null;
                  const next = projects.find(p => p.id === nextId);
                  // Clear billable when switching to a project that can't carry it, so the value
                  // sent matches the (now disabled, unticked) checkbox rather than a stale true.
                  onUpdate(next && !next.billableAllowed
                    ? { projectId: nextId, isBillable: false }
                    : { projectId: nextId });
                }}
                disabled={isLeave}
              >
                <option value="">Project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
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
              <div style={{ ...inputStyle, fontSize: 12 }}>{task.categoryName ?? '—'}</div>
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
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
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
          ? <div style={{ ...inputStyle, opacity: 0.7, lineHeight: 1.5 }}>{task.description || '—'}</div>
          : <Txt value={task.description} onChange={e => onUpdate({ description: e.target.value })} rows={2} placeholder="What did you work on?" style={{ minHeight: 54 }} />}
      </div>

      {/* Blocker reason — only for BLOCKED status */}
      {isBlocked && (
        <div style={{ marginTop: 10 }}>
          <Label>
            <span style={{ color: '#E4373D' }}>Blocker reason</span>
            <span style={{ color: '#E4373D', marginLeft: 3 }}>*</span>
          </Label>
          {isReadOnly
            ? <div style={{ ...inputStyle, opacity: 0.7, lineHeight: 1.5, borderColor: 'rgba(228,55,61,.3)' }}>{task.blockerReason || '—'}</div>
            : <Txt
                value={task.blockerReason}
                onChange={e => onUpdate({ blockerReason: e.target.value })}
                rows={2}
                placeholder="Describe what is blocking you and what support you need"
                style={{ minHeight: 54, borderColor: 'rgba(228,55,61,.35)' }}
              />}
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
