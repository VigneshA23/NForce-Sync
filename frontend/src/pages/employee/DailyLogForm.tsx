/**
 * Daily Log — PLAIN_LOG EOD form for PM / Admin / SuperAdmin roles, and for an EMPLOYEE with no active
 * project allocation (the bench). The category list is chosen by the server from the caller and entry date.
 *
 * Design matches SubmitEOD.tsx exactly: same inputStyle (var(--line2), borderRadius 6),
 * same Label primitive, same section spacing (marginTop 24/28), same button style.
 * Layout: one column, left-aligned, capped at ~1280px (see .nf-dl-* in index.css). The old right-hand
 * cards live on as: a submission-window chip/banner + an approval status line under the header, and a
 * "How it works" popover beside the title (dailyLogParts.tsx).
 */
import { DateStepper } from '../../components/DateStepper';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle, Clock, Lock, Send, Save, Plus, Trash2,
  ListPlus,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { todayISO, formatDate } from '../../lib/date';
import { saveDraft, submitEntry, listEntries, getDayDefaults } from '../../api/eod';
import { useEntryPieces } from '../../api/approvalPieces';
import { useDashboardSummary } from '../../api/employee';
import type { EodEntryDto, EodLogLineDto, SaveLogLineRequest } from '../../api/eod';
import { DatePicker } from '../../components/DatePicker';
import { TimeAdjustmentSection } from '../../components/timeAdjustment/TimeAdjustmentSection';
import { useTimeAdjustment } from '../../components/timeAdjustment/useTimeAdjustment';
import { minutesLabel } from '../../components/timeAdjustment/timeAdjustment';
import { BlockerReasonField, TaskStatusField } from '../../components/taskStatus/TaskStatusFields';
import { ApprovalStatusLine, SubmissionWindow } from './dailyLogParts';
import { useSubmissionWindow } from './useSubmissionWindow';
import { LegacyLogNotice } from './LegacyLogNotice';
import { legacyLogOf } from './dailyLogLegacy';
import { api } from '../../api/client';
import { extractError, lockedLineIdOf } from '../../lib/extractError';
import {
  DEFAULT_BENCH_DAILY_HOURS, MAX_DESC, QUARTER, benchHoursMessage, benchHoursRuleApplies, benchTargetHours,
  clearedCategoriesNotice, descriptionError,
  draftBlockReason, draftErrorMessage, firstInvalidLine, lineFieldId, lineProblems, maxBenchLineHours,
  noCategoriesMessage, staleCategoryRows, statusProblemMessages, type LineField,
} from './dailyLogValidation';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTOSAVE_MS   = 2000;
const MAX_TEXT      = 300;
const MAX_NOTES     = 8000;
// MIN_DESC, MAX_DESC and QUARTER live in ./dailyLogValidation (shared with the validator and tests).
const WORK_LOCS     = ['Office', 'Remote', 'Client Site', 'Field'];

const DAY_TYPES = [
  { value: 'WORKING_DAY',       label: 'Working day'      },
  { value: 'FIRST_HALF_LEAVE',  label: 'First half leave' },
  { value: 'SECOND_HALF_LEAVE', label: 'Second half leave'},
  { value: 'LEAVE',             label: 'Leave'            },
  { value: 'HOLIDAY',           label: 'Holiday'          },
  { value: 'WEEKEND',           label: 'Weekend'          },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskCategoryDto { id: number; name: string; scope: string; }
interface LogLine {
  key: number; categoryId: number | null; hours: number; description: string;
  /** The saved line this row came from, so a re-save keeps the same row and its blocker thread (see SaveLogLineRequest.id). */
  serverId?: number | null;
  /** The line's blocker already has a conversation, so it cannot be removed (set from the server). */
  locked?: boolean;
  taskStatus: string;      // '' until chosen; a draft may leave it, a submit may not
  blockerReason: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _k = 0;
const nextKey   = () => ++_k;
const blankLine = (): LogLine => ({ key: nextKey(), categoryId: null, hours: 0.5, description: '', taskStatus: '', blockerReason: '' });
const round25   = (v: number) => Math.round(v / QUARTER) * QUARTER;


function linesFromDto(ll: EodLogLineDto[]): LogLine[] {
  return ll.map(l => ({
    key: nextKey(), categoryId: l.categoryId, hours: l.hours, description: l.description,
    serverId: l.id, taskStatus: l.taskStatus ?? '', blockerReason: l.blockerReason ?? '',
    locked: l.hasBlockerThread === true,
  }));
}

function sumHours(lines: LogLine[]) {
  return round25(lines.reduce((s, l) => s + l.hours, 0));
}

function entrySignature(date: string, e?: EodEntryDto | null) {
  return e ? `${date}|${e.id}|${e.status}|${new Date(e.updatedAt).getTime()}` : `${date}|none`;
}

/** Thrown before a draft request is sent when a row has no category (see draftBlockReason). */
class DraftBlockedError extends Error {}

function editable(entry: EodEntryDto | null | undefined) {
  return !entry || entry.status === 'DRAFT' || entry.status === 'REJECTED';
}


// ── Design tokens — exact copies from SubmitEOD ───────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', minHeight: 38,   // one height for every single-line control
  background: 'var(--raised2)', border: '1px solid var(--line2)',
  borderRadius: 6, color: 'var(--txt)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

const disabledInputStyle: React.CSSProperties = { ...inputStyle, opacity: 0.45, cursor: 'not-allowed' };

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
      {children}
    </div>
  );
}

function Req() { return <span style={{ color: '#E4373D' }}>*</span>; }

function Sel(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...(props.disabled ? disabledInputStyle : inputStyle), ...props.style }}>{props.children}</select>;
}

function Txt(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.5, ...props.style }} />;
}

function CharCount({ value, max = MAX_TEXT }: { value: string; max?: number }) {
  const used = value.length, atLimit = used >= max;
  return (
    <div aria-live="polite" style={{ fontSize: 11, color: atLimit ? 'var(--warn)' : 'var(--txt-dim)', textAlign: 'right', marginTop: 4 }}>
      {used}/{max} characters used
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { color: string; label: string }> = {
    DRAFT:     { color: '#9BA1AC', label: 'Draft'     },
    SUBMITTED: { color: '#4C8DD6', label: 'Submitted' },
    APPROVED:  { color: '#2FB67C', label: 'Approved'  },
    REJECTED:  { color: '#E4373D', label: 'Rejected'  },
    MISSED:    { color: '#6B7280', label: 'Missed'    },
  };
  const { color, label } = cfg[status] ?? cfg.DRAFT;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}40`, fontSize: 11, fontWeight: 500, color }}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DailyLogForm() {
  const { user }      = useAuth();
  const { showToast } = useToast();
  const qc            = useQueryClient();
  const [sp, setSP]   = useSearchParams();

  const [selectedDate, setSelectedDate] = useState(sp.get('date') ?? todayISO());
  const [entryId,      setEntryId]      = useState<number | null>(null);
  const [entryStatus,  setEntryStatus]  = useState<string | null>(null);
  const [dayType,      setDayType]      = useState('WORKING_DAY');
  const [workLocation, setWorkLocation] = useState('');
  const [nextDayPlan,  setNextDayPlan]  = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [rawLines,     setLines]        = useState<LogLine[]>([]);
  const [notes,        setNotes]        = useState('');
  const [isLeave,      setIsLeave]      = useState(false);
  // Weekend only: "I worked on this day". Off (default) = no-work weekend, no line items; reset on date change.
  const [weekendWorked, setWeekendWorked] = useState(false);
  const [dirty,        setDirty]        = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  const [autosaving,   setAutosaving]   = useState(false);
  // Why the last autosave did not go through (null = fine). Autosave never toasts, but it must not fail unseen.
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  // Server refusals to remove a line whose blocker has a conversation, by the line's server id (shown next to the line).
  const [lineNotices, setLineNotices] = useState<Record<number, string>>({});
  const [errors,       setErrors]       = useState<string[]>([]);
  // Set by a failed submit: only then do empty required fields turn red, so a freshly added row isn't born
  // in an error state. `focusTarget.n` bumps on every failed attempt so repeating it re-focuses the field.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ key: number; field: LineField; n: number } | null>(null);
  // Time adjustment (Working day only) — the same state, rules and markup as Submit EOD. A day marked as leave carries none.
  const ta = useTimeAdjustment({ date: selectedDate, dayType: isLeave ? 'LEAVE' : dayType, enabled: !!user, onChange: () => setErrors([]) });

  const errorRef      = useRef<HTMLDivElement>(null);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedRef    = useRef<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading: loadingEntry } = useQuery({
    queryKey: ['eod', 'list', user?.id, selectedDate],
    queryFn:  () => listEntries(undefined, selectedDate, selectedDate),
    enabled:  !!user,
  });

  // The backend chooses the list from who you are and the entry date (Bench Log categories for an employee
  // with no active project that day, the Daily Log categories for everyone else) — the client never picks a
  // scope. Keyed by date, so it refetches when the date changes; `categoriesReady` is false until the new
  // date's list has arrived, so the stale-category check below never runs against an empty placeholder.
  const { data: categories = [], isSuccess: categoriesReady } = useQuery<TaskCategoryDto[]>({
    queryKey: ['task-categories', 'daily-log', user?.id, selectedDate],
    queryFn:  () => api.get<TaskCategoryDto[]>('/task-categories/daily-log', { params: { date: selectedDate } }).then(r => r.data),
    staleTime: 60_000,
    enabled:  !!user,
  });

  const { data: dayDefaults, isLoading: loadingDD } = useQuery({
    queryKey: ['eod', 'day-defaults', selectedDate],
    queryFn:  () => getDayDefaults(selectedDate),
    staleTime: 0, enabled: !!user,
  });

  const { data: dashboard, dataUpdatedAt: dashboardFetchedAt } = useDashboardSummary();

  const entry: EodEntryDto | null = entries[0] ?? null;

  // `rawLines` is what the user has typed; `lines` is what everything else reads (render, validation, autosave,
  // submit). A category the server's list for this date does not contain — e.g. Copy yesterday from a date on
  // the other side of an allocation change, or one deactivated since the draft was saved — is blanked here, so a
  // stale category can never be submitted or saved, and the row asks for a new pick. Derived, not an effect:
  // picking a valid category writes it into rawLines and the row (and the notice) simply stop being stale.
  // Waits for this date's own list (`categoriesReady`) and leaves read-only entries as filed.
  const staleRows = useMemo(
    () => (categoriesReady && editable(entry) ? staleCategoryRows(rawLines, categories.map(c => c.id)) : []),
    [rawLines, categories, categoriesReady, entry]);
  const lines = useMemo(
    () => (staleRows.length === 0 ? rawLines
      : rawLines.map((l, i) => (staleRows.includes(i) ? { ...l, categoryId: null } : l))),
    [rawLines, staleRows]);
  const clearedNotice = clearedCategoriesNotice(staleRows);
  const { data: pieces = [] }     = useEntryPieces(entryId);
  const dailyCap                  = dayDefaults?.workingHoursPerDay ?? 8;
  // Same definition as the server: an existing entry carries its frozen bench_mode; a date with no entry yet
  // takes today's (capabilities.benchMode, from BenchModePolicy). A PM/Admin on this form is never bench. It
  // words the "no categories" messages and switches on the exactly-8.0-hrs rule — the category list itself
  // always comes from the server.
  const benchMode                 = entry ? entry.benchMode === true : user?.capabilities?.benchMode === true;

  // ── Populate form ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (loadingEntry || loadingDD) return;
    const sig = entrySignature(selectedDate, entry);
    if (appliedRef.current === sig) return;
    appliedRef.current = sig;

    if (entry) {
      setEntryId(entry.id ?? null); setEntryStatus(entry.status);
      // The server rejects any day type but WEEKEND on a locked weekend date, so an editable entry that
      // predates the lock is shown (and re-saved) as Weekend; a submitted one keeps its filed day type.
      setDayType((entry.status === 'DRAFT' || entry.status === 'REJECTED') && dayDefaults?.dayType === 'WEEKEND'
        ? 'WEEKEND' : (entry.dayType ?? 'WORKING_DAY'));
      setWeekendWorked(entry.weekendWorked === true || (entry.logLines?.length ?? 0) > 0 || (entry.logTotalHours ?? 0) > 0);
      ta.load(entry);
      setWorkLocation(entry.workLocation ?? ''); setNextDayPlan(entry.nextDayPlan ?? '');
      setRemarks(entry.remarks ?? ''); setNotes(entry.logNotes ?? '');
      if (entry.entryForm === 'PLAIN_LOG') {
        if (entry.logLines?.length) { setLines(linesFromDto(entry.logLines)); setIsLeave(false); }
        else if ((entry.logTotalHours ?? 0) === 0 && entry.status !== 'DRAFT' && entry.status !== 'REJECTED') { setLines([]); setIsLeave(true); } // a filed leave record; an empty DRAFT is just a blank form
        else { setLines([]); setIsLeave(false); }
      }
    } else {
      setEntryId(null); setEntryStatus(null);
      setDayType(dayDefaults?.dayType ?? 'WORKING_DAY'); setWeekendWorked(false);
      setWorkLocation(dayDefaults?.workLocation ?? '');
      setNextDayPlan(''); setRemarks(''); setNotes(''); setLines([]); setIsLeave(false); ta.reset();
    }
    setErrors([]); setDirty(false);
  }, [entries, loadingEntry, selectedDate, dayDefaults, loadingDD]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (errors.length) errorRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }); }, [errors]);

  // Declared after the banner scroll above so it wins when a line item is the problem: scroll to the first
  // invalid row and put the cursor in its first invalid control.
  useEffect(() => {
    if (!focusTarget) return;
    const el = document.getElementById(lineFieldId(focusTarget.key, focusTarget.field));
    if (!el) return;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement).focus({ preventScroll: true });
  }, [focusTarget]);
  useEffect(() => { setSP(selectedDate === todayISO() ? {} : { date: selectedDate }, { replace: true }); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────

  const isEditable   = editable(entry);
  const isReadOnly   = !isEditable;
  const isRejected   = entryStatus === 'REJECTED';
  const isNonWork    = dayType === 'LEAVE' || dayType === 'HOLIDAY';
  const isWeekend    = dayType === 'WEEKEND';
  const wLocDisabled = isNonWork || isWeekend;
  // The server decides what is a weekend (Business Rules weekend rule; holidays win), so the lock reads
  // its answer instead of re-deriving it from getDay(). A working Saturday under SUN_ONLY is not locked.
  const weekendLocked = dayDefaults?.dayType === 'WEEKEND';
  const noWorkWeekend  = isWeekend && !weekendWorked;
  const total        = isLeave ? 0 : sumHours(lines);
  // Bench Working day only: lines must total exactly 8.0. Non-null = the inline message and a disabled Submit.
  const benchRule    = isEditable && benchHoursRuleApplies(benchMode, dayType, isLeave);
  const benchTarget  = benchTargetHours(user?.capabilities?.benchDailyHours ?? DEFAULT_BENCH_DAILY_HOURS, ta.adjActive ? ta.adjMins : 0);
  const benchMsg     = benchRule ? benchHoursMessage(lines, benchTarget, ta.adjActive ? ta.adjMins : 0) : null;
  // What the "x / y hrs total" counter shows: the bench target when that rule applies, else the usual day.
  const shownCap     = benchRule ? benchTarget : dailyCap;
  const hoursOver    = total > dailyCap && !benchRule;
  const isToday      = selectedDate === todayISO();
  const isPast       = selectedDate < todayISO();
  const cutoff       = dashboard?.cutoffStatus;
  // The "Submission window" (closes-at, countdown, closed, late) is counted from the server's clock.
  const windowState  = useSubmissionWindow(cutoff, dashboardFetchedAt, isToday);
  const showPastDate = isPast && isEditable;

  const rmPiece      = pieces.find(p => p.approverType === 'REPORTING_MANAGER');
  const managerName  = rmPiece?.approverName ?? null;
  const rejectComment = pieces.find(p => p.status === 'REJECTED')?.comment ?? null;
  const noManager    = !!user && !managerName && pieces.length > 0 && pieces[0]?.approverType !== 'REPORTING_MANAGER';

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDateChange(d: string) { appliedRef.current = null; setSelectedDate(d); setErrors([]); setSubmitAttempted(false); setAutosaveError(null); setLineNotices({}); }

  function handleDayTypeChange(v: string) {
    if (v !== 'WORKING_DAY') ta.reset(); // an adjustment exists only on a full Working day; the server clears it too
    setDayType(v); setWeekendWorked(false);
    if (v !== 'WORKING_DAY' && v !== 'FIRST_HALF_LEAVE' && v !== 'SECOND_HALF_LEAVE') setWorkLocation('');
    setErrors([]); setDirty(true);
  }

  const addLine    = useCallback(() => { setLines(p => [...p, blankLine()]); setIsLeave(false); setDirty(true); }, []);
  // A line whose blocker has a conversation is never removed here (its Remove button is disabled and says why).
  const removeLine = useCallback((key: number) => { setLines(p => p.filter(l => l.key !== key || l.locked)); setDirty(true); }, []);
  const updateLine = useCallback((key: number, patch: Partial<Omit<LogLine,'key'>>) => {
    setLines(p => p.map(l => l.key === key ? { ...l, ...patch } : l)); setDirty(true);
  }, []);

  // ── Request builder ───────────────────────────────────────────────────────

  const buildReq = useCallback(() => ({
    entryDate: selectedDate,
    dayType: dayType as 'WORKING_DAY'|'LEAVE'|'HOLIDAY'|'WEEKEND'|'FIRST_HALF_LEAVE'|'SECOND_HALF_LEAVE',
    ...ta.payload(),
    workLocation: wLocDisabled ? null : (workLocation || null),
    weekendWorked: isWeekend ? weekendWorked : undefined,
    nextDayPlan: nextDayPlan || null, remarks: remarks || null,
    tasks: [], attachmentIds: [], entryForm: 'PLAIN_LOG' as const,
    logLines: (isLeave || isNonWork || noWorkWeekend ? [] : lines).map((l, i) => ({
      categoryId: l.categoryId ?? 0, hours: l.hours, description: l.description, sortOrder: i,
      id: l.serverId ?? null,
      taskStatus: l.taskStatus || null, // '' would fail enum parsing server-side
      blockerReason: l.taskStatus === 'BLOCKED' ? (l.blockerReason.trim() || null) : null,
    } as SaveLogLineRequest)),
    logNotes: notes.trim() || null,
  }), [selectedDate, dayType, workLocation, nextDayPlan, remarks, lines, notes, isLeave, isNonWork, wLocDisabled, isWeekend, weekendWorked, noWorkWeekend, ta.adjActive, ta.adjType, ta.adjMins]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string[] {
    if (isNonWork || noWorkWeekend) return [];
    const e: string[] = [];
    if (isWeekend && lines.length === 0) e.push('Add at least one line item when you worked on a weekend.');
    if (!wLocDisabled && !workLocation)    e.push('Work location is required.');
    if (!isWeekend && !nextDayPlan.trim()) e.push('Next-day plan is required.');
    if (!isLeave && !isNonWork && firstInvalidLine(lines))
      e.push('Fix all line items before submitting.');
    e.push(...ta.validate());
    if (ta.adjActive && !isLeave && lines.length === 0) e.push('A time adjustment needs hours logged — remove it, or add your time breakdown.');
    e.push(...statusProblemMessages(lines));
    if (benchMsg) e.push(benchMsg);
    if (notes.length      > MAX_NOTES) e.push(`Notes must be under ${MAX_NOTES} characters.`);
    if (nextDayPlan.length > MAX_TEXT)  e.push(`Next-day plan must be under ${MAX_TEXT} characters.`);
    if (remarks.length     > MAX_TEXT)  e.push(`Remarks must be under ${MAX_TEXT} characters.`);
    return e;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  // A 409 "this line has a blocker conversation, so it cannot be removed" is about one saved line. Show the message next
  // to THAT line (keyed by its server id), and reload the entry so a row removed locally comes back — locked, with its
  // Remove button disabled. Returns true when the error was that one (the caller then skips its generic handling).
  const reportLockedLine = useCallback((err: unknown): boolean => {
    const id = lockedLineIdOf(err);
    if (id == null) return false;
    setLineNotices(p => ({ ...p, [id]: extractError(err) }));
    setErrors([]);
    appliedRef.current = null;
    qc.invalidateQueries({ queryKey: ['eod'] });
    return true;
  }, [qc]);

  const saveMut = useMutation({
    mutationFn: () => {
      const blocked = draftBlockReason(isLeave || isNonWork || noWorkWeekend ? [] : lines);
      if (blocked) throw new DraftBlockedError(blocked);
      return saveDraft(buildReq());
    },
    onSuccess: (saved) => {
      setAutosaveError(null);
      setEntryId(saved.id ?? null); setEntryStatus(saved.status);
      appliedRef.current = entrySignature(selectedDate, saved);
      setDirty(false); qc.invalidateQueries({ queryKey: ['eod'] });
      showToast('success', 'Draft saved');
    },
    // extractError reads the server's {error, fields}: a rejected draft says which row and why.
    // A server rejection (e.g. this date belongs to the other form, or a category not allowed for the date) is
    // also shown in the banner, because a toast alone is easy to miss for a message that needs acting on.
    onError: (err: unknown) => {
      if (err instanceof DraftBlockedError) { showToast('error', `Can't save draft yet — ${err.message}`); return; }
      if (reportLockedLine(err)) return;
      const msg = draftErrorMessage(extractError(err));
      showToast('error', msg); setErrors([msg]);
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const errs = validate();
      if (errs.length) {
        setErrors(errs);
        setSubmitAttempted(true);
        const bad = !isLeave && !isNonWork && !noWorkWeekend ? firstInvalidLine(lines) : null;
        if (bad) setFocusTarget(t => ({ ...bad, n: (t?.n ?? 0) + 1 }));
        throw new Error('validation');
      }
      setErrors([]);
      setSubmitAttempted(false);
      const saved = await saveDraft(buildReq());
      return submitEntry(saved.id);
    },
    onSuccess: (saved) => {
      setEntryStatus(saved.status);
      appliedRef.current = entrySignature(selectedDate, saved);
      setDirty(false); qc.invalidateQueries({ queryKey: ['eod'] });
      showToast('success', isLeave || isNonWork ? 'Leave day recorded' : noWorkWeekend ? 'Weekend recorded' : 'Daily log submitted');
    },
    onError: (err: unknown) => {
      if ((err as Error).message === 'validation') return;
      if (reportLockedLine(err)) return;
      const msg = extractError(err);
      showToast('error', msg); setErrors([msg]);
    },
  });

  // ── Autosave ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!dirty || !isEditable) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const blocked = draftBlockReason(isLeave || isNonWork || noWorkWeekend ? [] : lines);
      if (blocked) { setAutosaveError(blocked); setDirty(false); return; }
      setAutosaving(true);
      try {
        const saved = await saveDraft(buildReq());
        setAutosaveError(null);
        setEntryId(saved.id ?? null); setEntryStatus(saved.status);
        appliedRef.current = entrySignature(selectedDate, saved);
        qc.invalidateQueries({ queryKey: ['eod'] });
      } catch (err) { if (!reportLockedLine(err)) setAutosaveError(draftErrorMessage(extractError(err))); }
      finally { setAutosaving(false); setDirty(false); }
    }, AUTOSAVE_MS);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [dirty, lines, notes, dayType, workLocation, nextDayPlan, remarks, isLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loadingEntry || loadingDD) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300, color:'var(--txt-dim)', fontSize:13 }}>Loading…</div>;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    // Full content width, like Submit EOD and the other pages (the Shell's own padding is the gutter); see the
    // .nf-dl-* rules in index.css.
    <div className="nf-dl-page">

      {/* ── Header (SubmitEOD PageHeader style) ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <DateStepper date={selectedDate} onChange={handleDateChange}>
            <h1 style={{ fontFamily:'"Inter","Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif', fontSize:26, fontWeight:700, color:'var(--txt)', margin:0, letterSpacing:'-0.01em' }}>
              Daily Log
            </h1>
          </DateStepper>
        </div>
        {entryStatus && <StatusBadge status={entryStatus} />}
      </div>

      {/* Status strip: who reviews it and where it stands, plus the submission window (a chip while open, a
          banner once closed). Replaces the Approval and Submission-window cards. */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:'10px 16px', marginBottom:20, minWidth:0 }}>
        <ApprovalStatusLine pieces={pieces} />
        <SubmissionWindow state={windowState} editable={isEditable} />
      </div>

      {/* ── Full-width banners ── */}

      {isRejected && (
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 16px', borderRadius:8, marginBottom:16, background:'rgba(228,55,61,.08)', border:'1px solid rgba(228,55,61,.3)' }}>
          <AlertTriangle size={15} style={{ color:'#E4373D', flexShrink:0, marginTop:1 }} aria-hidden />
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'#E4373D', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Rejected</div>
            {rejectComment && <div style={{ fontSize:13, color:'var(--txt)', lineHeight:1.5 }}>{rejectComment}</div>}
            <div style={{ fontSize:12, color:'var(--txt-mut)', marginTop:4 }}>Edit your log and resubmit below.</div>
          </div>
        </div>
      )}

      {isReadOnly && (
        <div style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 16px', borderRadius:8, marginBottom:16, background:entryStatus==='APPROVED'?'rgba(47,182,124,.08)':'rgba(76,141,214,.08)', border:`1px solid ${entryStatus==='APPROVED'?'rgba(47,182,124,.3)':'rgba(76,141,214,.3)'}` }}>
          {entryStatus==='APPROVED'
            ? <CheckCircle size={14} style={{ color:'#2FB67C', flexShrink:0 }} aria-hidden />
            : <Clock size={14} style={{ color:'#4C8DD6', flexShrink:0 }} aria-hidden />}
          <span style={{ fontSize:13, color:'var(--txt-mut)' }}>
            {entryStatus==='APPROVED' ? 'This log has been approved. No changes can be made.' : 'This log has been submitted and is awaiting review.'}
          </span>
        </div>
      )}

      {showPastDate && (
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 16px', borderRadius:8, marginBottom:16, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.3)' }}>
          <Clock size={15} style={{ color:'#E0A93B', flexShrink:0, marginTop:1 }} aria-hidden />
          <div>
            <div style={{ fontSize:13, color:'var(--txt)', fontWeight:500 }}>Submitting for a past date.</div>
            <div style={{ fontSize:12, color:'var(--txt-mut)', marginTop:2 }}>This entry will be marked late.</div>
          </div>
        </div>
      )}

      {noManager && isEditable && (
        <div style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 16px', borderRadius:8, marginBottom:16, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.3)' }}>
          <AlertTriangle size={14} style={{ color:'#E0A93B', flexShrink:0 }} aria-hidden />
          <span style={{ fontSize:13, color:'var(--txt-mut)' }}>No reporting manager assigned — your log will route to the admin group for review.</span>
        </div>
      )}

      {errors.length > 0 && (
        <div ref={errorRef} style={{ padding:'12px 16px', borderRadius:8, marginBottom:16, background:'rgba(228,55,61,.08)', border:'1px solid rgba(228,55,61,.25)' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--risk)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Fix before submitting</div>
          <ul style={{ margin:0, paddingLeft:16 }}>
            {errors.map((e,i) => <li key={i} style={{ fontSize:13, color:'var(--risk)', lineHeight:1.6 }}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* The fields sit in their own container-query context, so stacking follows the form's OWN width
          (sidebar open or not). The sticky action bar below is deliberately outside it. */}
      <div className="nf-dl-fields">

          {/* Meta row — Entry date | Day type | Work location (matches SubmitEOD) */}
          <div className="nf-dl-meta" style={{ marginTop:24 }}>
            <div>
              <Label>Entry date</Label>
              <DatePicker value={selectedDate} onChange={handleDateChange} max={todayISO()} inputStyle={inputStyle} />
            </div>
            <div>
              <Label>Day type <Req /></Label>
              {isReadOnly || (weekendLocked && isWeekend)
                ? <div title={!isReadOnly ? 'Weekend dates are always logged as Weekend' : undefined} style={{ ...inputStyle, opacity:0.7 }}>{DAY_TYPES.find(d => d.value===dayType)?.label ?? dayType}</div>
                : <Sel value={dayType} onChange={e => handleDayTypeChange(e.target.value)}>
                    {DAY_TYPES.filter(d => d.value !== 'WEEKEND' || dayType === 'WEEKEND').map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </Sel>}
            </div>
            <div>
              <Label>Work location {!wLocDisabled && <Req />}</Label>
              {isReadOnly
                ? <div style={{ ...inputStyle, opacity:0.7 }}>{workLocation || '-'}</div>
                : <Sel value={wLocDisabled ? '' : workLocation} onChange={e => { setWorkLocation(e.target.value); setDirty(true); }} disabled={wLocDisabled}>
                    <option value="">Select location</option>
                    {WORK_LOCS.map(l => <option key={l} value={l}>{l}</option>)}
                  </Sel>}
            </div>
          </div>

          {/* Non-work day / leave banner */}
          {/* Time adjustment (checkbox, shift timings, type, duration, impact, balance) — the same block as Submit
              EOD, for every Daily Log user. Working day with a shift only; hidden while "Mark as leave day". */}
          <TimeAdjustmentSection
            ta={ta}
            dailyHoursCap={dailyCap}
            isEditable={isEditable}
            isReadOnly={isReadOnly}
            recapNote={<>{minutesLabel(ta.adjMins)} counted toward this day's logged hours{benchMode ? ` - the lines total ${benchTarget.toFixed(1)}h with it.` : '.'}</>}
          />

          {(isNonWork || isWeekend) && (
            <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'12px 16px', borderRadius:8, marginTop:24, background:'rgba(47,182,124,.08)', border:'1px solid rgba(47,182,124,.3)' }}>
              <CheckCircle size={15} style={{ color:'var(--ok)', flexShrink:0, marginTop:1 }} aria-hidden />
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--ok)', marginBottom:2 }}>No tasks required</div>
                <div style={{ fontSize:12, color:'var(--txt-mut)', lineHeight:1.5 }}>
                  {dayType==='LEAVE' || isLeave ? 'Leave day — this entry will be auto-approved.'
                    : dayType==='HOLIDAY' ? 'Company holiday — this entry will be auto-approved.'
                    : weekendWorked ? 'You worked this weekend day. Every hour you log counts as overtime.'
                    : 'Weekend — no line items required. Submit as-is to record no work, or turn on "I worked on this day".'}
                </div>
                {isWeekend && isEditable && (
                  <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, fontSize:13, color:'var(--txt)', cursor:'pointer' }}>
                    <input type="checkbox" checked={weekendWorked} onChange={e => { setWeekendWorked(e.target.checked); setErrors([]); setDirty(true); }} />
                    I worked on this day
                  </label>
                )}
              </div>
            </div>
          )}

          {/* ── Time breakdown section (SubmitEOD Tasks section style) ── */}
          {!isNonWork && !noWorkWeekend && (
            <div style={{ marginTop:28 }}>
              {/* Section header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--txt-mut)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                  Time breakdown
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {lines.length > 0 && !isLeave && (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:72, height:5, borderRadius:3, background:'var(--line2)', overflow:'hidden' }} aria-hidden>
                        <div style={{ height:'100%', borderRadius:3, transition:'width 200ms ease', width:`${Math.min(100,(total/Math.max(0.01,shownCap))*100)}%`, background:hoursOver?'var(--warn)':'var(--ok)' }} />
                      </div>
                      <div style={{ fontSize:13, color:'var(--txt-mut)', fontVariantNumeric:'tabular-nums' }}>
                        <span style={{ color:'var(--txt)', fontWeight:600 }}>{total.toFixed(1)}</span>
                        {' '}/ {shownCap.toFixed(1)} hrs total
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Legacy notice */}
              {/* Editable: the "Legacy entry format" notice. Locked (pending / approved): a read-only block
                  with the saved summary and hours — read from the entry, since the lines state is empty. */}
              <LegacyLogNotice entry={entry} isEditable={isEditable} dailyCap={dailyCap} />

              {/* Empty state — editable: two clear actions */}
              {lines.length===0 && !isLeave && isEditable && (
                <div style={{ padding:'32px 20px', borderRadius:10, textAlign:'center', border:'1px dashed var(--line2)', background:'var(--raised)' }}>
                  <div aria-hidden style={{ width:40, height:40, borderRadius:'50%', background:'var(--raised2)', border:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                    <ListPlus size={18} color="var(--txt-dim)" />
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', marginBottom:4 }}>No time logged yet</div>
                  <div style={{ fontSize:12.5, color:'var(--txt-dim)', marginBottom:18, lineHeight:1.5 }}>
                    Break your day into line items{!isWeekend ? ', or mark the whole day as leave' : ''}.
                  </div>
                  <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                    <button onClick={addLine} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:6, background:'var(--raised2)', border:'1px solid var(--brand)', color:'var(--txt)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      <Plus size={14} aria-hidden />Add line item
                    </button>
                    {!isWeekend && (
                      <button onClick={() => { setIsLeave(true); ta.reset(); setDirty(true); }} style={{ padding:'9px 16px', borderRadius:6, background:'transparent', border:'1px solid var(--line2)', color:'var(--txt-mut)', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                        Mark as leave day
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Leave day: a clear confirmation, with Cancel as a quiet secondary action */}
              {isLeave && (
                <div role="status" style={{ display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', padding:'16px 18px', borderRadius:10, background:'rgba(47,182,124,.08)', border:'1px solid rgba(47,182,124,.3)' }}>
                  <CheckCircle size={20} style={{ color:'var(--ok)', flexShrink:0 }} aria-hidden />
                  <div style={{ flex:'1 1 220px', minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>Marked as a leave day</div>
                    <div style={{ fontSize:12.5, color:'var(--txt-mut)', marginTop:2, lineHeight:1.5 }}>
                      Auto-approved — no manager review needed.{isEditable ? ' Record it when you are ready.' : ''}
                    </div>
                  </div>
                  {isEditable && (
                    <button onClick={() => { setIsLeave(false); setDirty(true); }} style={{ padding:'7px 14px', borderRadius:6, background:'transparent', border:'1px solid var(--line2)', color:'var(--txt-mut)', fontSize:12.5, fontWeight:500, cursor:'pointer' }}>
                      Cancel leave
                    </button>
                  )}
                </div>
              )}

              {/* Empty state — read-only submitted with no lines */}
              {lines.length===0 && !isLeave && isReadOnly && !legacyLogOf(entry) && (
                <div style={{ padding:'18px 16px', borderRadius:8, border:'1px solid var(--line)', background:'var(--raised)', color:'var(--txt-dim)', fontSize:13, textAlign:'center' }}>
                  No time breakdown logged for this day.
                </div>
              )}

              {/* Line item cards — SubmitEOD group-card style */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {lines.map((line, idx) => (
                  <LineRow
                    key={line.key}
                    line={line}
                    index={idx}
                    categories={categories}
                    benchMode={benchMode}
                    maxHours={benchRule ? maxBenchLineHours(lines, line.key, benchTarget) : 24}
                    isReadOnly={isReadOnly}
                    showErrors={submitAttempted}
                    notice={line.serverId != null ? lineNotices[line.serverId] : undefined}
                    onUpdate={patch => updateLine(line.key, patch)}
                    onRemove={() => removeLine(line.key)}
                  />
                ))}
              </div>

              {/* Bench Working day: must total exactly 8.0 hrs */}
              {benchMsg && (
                <div role="alert" style={{ display:'flex', gap:6, alignItems:'center', fontSize:12, color:'var(--warn)', marginTop:10, fontWeight:500 }}>
                  <AlertTriangle size={13} />
                  {benchMsg}
                </div>
              )}

              {/* No-categories warning */}
              {isEditable && !isLeave && categories.length === 0 && lines.length > 0 && (
                <div style={{ display:'flex', gap:8, alignItems:'center', padding:'9px 13px', borderRadius:7, marginTop:6, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.25)', fontSize:12, color:'var(--warn)' }}>
                  <AlertTriangle size={13} />
                  {noCategoriesMessage(benchMode).lead}
                  {noCategoriesMessage(benchMode).admin && (
                    <><strong style={{ color:'var(--txt)', margin:'0 3px' }}>{noCategoriesMessage(benchMode).admin}</strong>{noCategoriesMessage(benchMode).tail}</>
                  )}
                </div>
              )}

              {/* Categories cleared because this date's list no longer allows them */}
              {isEditable && clearedNotice && (
                <div role="status" style={{ display:'flex', gap:8, alignItems:'center', padding:'9px 13px', borderRadius:7, marginTop:6, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.25)', fontSize:12, color:'var(--warn)' }}>
                  <AlertTriangle size={13} />
                  {clearedNotice}
                </div>
              )}

              {/* Add line */}
              {isEditable && !isLeave && lines.length > 0 && (
                <button
                  onClick={addLine}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:6, marginTop:10, background:'transparent', border:'1px dashed var(--line2)', color:'var(--txt-mut)', fontSize:13, cursor:'pointer', transition:'border-color 120ms, color 120ms' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--brand)'; (e.currentTarget as HTMLButtonElement).style.color='var(--txt)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--line2)'; (e.currentTarget as HTMLButtonElement).style.color='var(--txt-mut)'; }}
                >
                  <Plus size={14} aria-hidden />Add line item
                </button>
              )}

            </div>
          )}

          {/* Next-day plan (required, first) and Remarks (optional): side by side from 1536px up, stacked below. */}
          <div className="nf-dl-textpair" style={{ marginTop:24 }}>
          {!isNonWork && !isWeekend && (
            <div>
              <Label>Next-day plan {!isWeekend && <Req />}</Label>
              {isReadOnly
                ? <div style={{ ...inputStyle, opacity:0.7, minHeight:60, lineHeight:1.5 }}>{nextDayPlan || '-'}</div>
                : <>
                    <Txt value={nextDayPlan} onChange={e => { setNextDayPlan(e.target.value); setDirty(true); }} placeholder="What are you planning to work on tomorrow?" rows={3} maxLength={MAX_TEXT} style={{ minHeight:96 }} />
                    <CharCount value={nextDayPlan} />
                  </>}
            </div>
          )}

          {/* Remarks */}
          <div>
            <Label>Remarks <span style={{ color:'var(--txt-dim)', textTransform:'none', fontWeight:400, letterSpacing:0 }}>(optional)</span></Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity:0.7, minHeight:50, lineHeight:1.5 }}>{remarks || '-'}</div>
              : <>
                  <Txt value={remarks} onChange={e => { setRemarks(e.target.value); setDirty(true); }} placeholder="Any blockers, dependencies, or context for your manager?" rows={2} maxLength={MAX_TEXT} style={{ minHeight:96 }} />
                  <CharCount value={remarks} />
                </>}
          </div>
          </div>

          {/* Additional notes — full width of the form column, capped so a line never runs 1000px+ */}
          <div style={{ marginTop:24 }}>
            <Label>Additional notes <span style={{ color:'var(--txt-dim)', textTransform:'none', fontWeight:400, letterSpacing:0 }}>(optional, private)</span></Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity:0.7, lineHeight:1.5 }}>{notes || '-'}</div>
              : <>
                  <Txt value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} placeholder="Extended notes for your own record — not visible to your reviewer." rows={3} maxLength={MAX_NOTES} style={{ minHeight:96 }} />
                  <CharCount value={notes} max={MAX_NOTES} />
                </>}
          </div>

          {/* ── Action buttons (SubmitEOD style — right-aligned) ── */}
      </div>

          {/* Sticky action bar: solid background + top border, always on screen; it sits in normal flow at the end
              of the form (so it never covers the last fields) and only floats while that end is off-screen. */}
          {isEditable && !confirming && (
            <div className="nf-dl-actionbar" style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
              {autosaving && <div style={{ fontSize:12, color:'var(--txt-dim)' }}>Saved just now</div>}
              {autosaveError && !autosaving && (
                <div role="status" style={{ fontSize:12, color:'var(--warn)', maxWidth:420, textAlign:'right' }}>
                  Not auto-saved: {autosaveError}
                </div>
              )}
              <div style={{ display:'flex', gap:10 }}>
                <button
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || submitMut.isPending}
                  style={{ padding:'9px 20px', borderRadius:6, background:'var(--raised2)', border:'1px solid var(--line2)', color:'var(--txt)', fontSize:13, fontWeight:500, cursor:'pointer', opacity:saveMut.isPending?0.6:1, display:'flex', alignItems:'center', gap:7 }}
                >
                  <Save size={14} />
                  {saveMut.isPending ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={saveMut.isPending || submitMut.isPending || benchMsg != null}
                  title={benchMsg ?? undefined}
                  style={{ padding:'9px 22px', borderRadius:6, background:'var(--brand)', border:'1px solid var(--brand-deep)', color:'#fff', fontSize:13, fontWeight:600, cursor:benchMsg?'not-allowed':'pointer', opacity:benchMsg?0.5:1, boxShadow:'0 2px 8px color-mix(in srgb, var(--brand) 35%, transparent)', display:'flex', alignItems:'center', gap:7 }}
                >
                  <Send size={14} />
                  {isLeave || isNonWork ? 'Record leave' : noWorkWeekend ? 'Record weekend' : 'Submit log'}
                </button>
              </div>
            </div>
          )}

          {/* Confirmation dialog */}
          {isEditable && confirming && (
            <div className="nf-dl-actionbar nf-dl-confirm" style={{ padding:'16px 18px', borderRadius:8, background:'color-mix(in srgb, var(--brand) 8%, var(--shell))', border:'1px solid rgba(177,17,22,.2)' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', marginBottom:6 }}>
                {isLeave || isNonWork ? 'Record this as a leave day?' : noWorkWeekend ? 'Record this weekend as no work?' : `Submit your daily log for ${formatDate(selectedDate)}?`}
              </div>
              <div style={{ fontSize:12, color:'var(--txt-mut)', marginBottom:14 }}>
                {isLeave || isNonWork || noWorkWeekend
                  ? 'It will be auto-approved. No manager review required.'
                  : managerName
                    ? `This will be sent to ${managerName} for review.`
                    : 'This will be routed for review.'}
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setConfirming(false)} style={{ padding:'9px 20px', borderRadius:6, background:'var(--raised2)', border:'1px solid var(--line2)', color:'var(--txt)', fontSize:13, fontWeight:500, cursor:'pointer' }}>Cancel</button>
                <button onClick={() => { setConfirming(false); submitMut.mutate(); }} disabled={submitMut.isPending} style={{ padding:'9px 22px', borderRadius:6, background:'var(--brand)', border:'1px solid var(--brand-deep)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:7 }}>
                  <Send size={14} />
                  {submitMut.isPending ? 'Submitting…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
    </div>
  );
}

// ── LineRow (SubmitEOD group-card style) ──────────────────────────────────────

interface LineRowProps {
  line: LogLine; index: number; categories: TaskCategoryDto[];
  /** Employee on the bench: they have no Org Masters to configure, so the empty placeholder must not point there. */
  benchMode: boolean;
  /** Highest hours this line may take (24, or on a bench Working day 8 minus the other lines). */
  maxHours: number;
  isReadOnly: boolean;
  /** True after a failed submit: empty required fields then show their error, not just malformed ones. */
  showErrors: boolean;
  /** The server refused to remove this line (its blocker has a conversation): shown next to the line. */
  notice?: string;
  onUpdate: (p: Partial<Omit<LogLine,'key'>>) => void;
  onRemove: () => void;
}

const LOCKED_LINE_TEXT = "This line has a blocker conversation with your reporting manager, so it can't be removed. Change its status instead.";

function LineRow({ line, index, categories, benchMode, maxHours, isReadOnly, showErrors, notice, onUpdate, onRemove }: LineRowProps) {
  const problems = lineProblems(line);
  const hoursOk  = problems.hours == null;
  // A description error shows once the user has typed something wrong, or — for an empty field — only after
  // they tried to submit (so a brand-new row isn't red before the user has done anything).
  const descError = isReadOnly ? null
    : (line.description.length > 0 || showErrors) ? descriptionError(line.description) : null;
  // Status / blocker-reason problems show once a submit was attempted (a fresh row is not red before the user acts).
  const statusError = !isReadOnly && showErrors ? problems.status ?? null : null;
  const reasonError = !isReadOnly && showErrors ? problems.blockerReason ?? null : null;
  const CHIPS   = [0.5, 1, 1.5, 2, 3, 4, 6, 8];

  const cellStyle: React.CSSProperties = {
    padding:'8px 10px', background:'var(--raised2)', border:'1px solid var(--line2)',
    borderRadius:6, color:'var(--txt)', fontSize:13, outline:'none', boxSizing:'border-box' as const,
  };

  return (
    <div style={{ border:'1px solid var(--line2)', borderRadius:10, overflow:'hidden' }}>
      {/* Card header — index, category, hours, delete */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', background:'var(--raised)', borderBottom:'1px solid var(--line)' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--txt-dim)', minWidth:16, flexShrink:0 }}>{index+1}</span>
        <select
          id={lineFieldId(line.key, 'category')}
          value={line.categoryId ?? ''}
          disabled={isReadOnly || categories.length === 0}
          onChange={e => onUpdate({ categoryId: e.target.value ? Number(e.target.value) : null })}
          style={{ ...cellStyle, flex:1, cursor:(isReadOnly||categories.length===0)?'default':'pointer', borderColor:line.categoryId==null&&!isReadOnly?'rgba(228,55,61,.4)':'var(--line2)' }}
        >
          <option value="">{categories.length === 0 ? (benchMode ? 'No categories available' : 'No categories — configure in Org Masters') : 'Select category…'}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          id={lineFieldId(line.key, 'hours')}
          type="number" min={QUARTER} max={maxHours} step={QUARTER}
          value={line.hours} disabled={isReadOnly}
          onChange={e => { const v=round25(parseFloat(e.target.value)||QUARTER); onUpdate({ hours:Math.min(maxHours,Math.max(QUARTER,v)) }); }}
          style={{ ...cellStyle, width:64, textAlign:'right', fontFamily:'"JetBrains Mono",monospace', fontWeight:700, borderColor:!hoursOk&&!isReadOnly?'rgba(228,55,61,.4)':'var(--line2)' }}
        />
        <span style={{ fontSize:12, color:'var(--txt-dim)', flexShrink:0 }}>h</span>
        {!isReadOnly && (
          <button
            type="button"
            onClick={line.locked ? undefined : onRemove}
            disabled={line.locked}
            aria-disabled={line.locked || undefined}
            title={line.locked ? LOCKED_LINE_TEXT : 'Remove this line'}
            aria-label={line.locked ? `Remove disabled: ${LOCKED_LINE_TEXT}` : 'Remove this line'}
            style={{ background:'none', border:'none', cursor:line.locked?'not-allowed':'pointer', color:line.locked?'var(--txt-dim)':'var(--risk)', opacity:line.locked?0.5:1, padding:4, flexShrink:0 }}
          >
            {line.locked ? <Lock size={14} /> : <Trash2 size={14} />}
          </button>
        )}
      </div>
      {/* Why this line cannot be removed — dim when it is only locked, red when the server just refused a removal. */}
      {(notice || (line.locked && !isReadOnly)) && (
        <div role={notice ? 'alert' : 'note'} style={{ display:'flex', gap:6, alignItems:'center', padding:'6px 14px', fontSize:11.5, color:notice?'var(--risk)':'var(--txt-dim)', background:notice?'rgba(228,55,61,.06)':'transparent', borderBottom:'1px solid var(--line)' }}>
          <Lock size={12} aria-hidden />
          {notice ?? LOCKED_LINE_TEXT}
        </div>
      )}
      {/* Hour chips + description */}
      <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {!isReadOnly && (
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {CHIPS.filter(v => v <= maxHours).map(v => (
              <button key={v} onClick={() => onUpdate({ hours:v })} style={{
                display:'inline-flex', alignItems:'center', gap:4,
                padding:'4px 9px', borderRadius:6,
                background:line.hours===v?'var(--raised2)':'transparent',
                border:`1px solid ${line.hours===v?'var(--line2)':'transparent'}`,
                fontSize:11, fontWeight:line.hours===v?600:400,
                color:line.hours===v?'var(--txt)':'var(--txt-dim)', cursor:'pointer',
              }}>
                {v}h
              </button>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 260px', minWidth:0 }}>
          {/* The marker lives on a label above the field (not only in the placeholder, which vanishes as soon
              as the user types). Same red * as Day type, Work location and Next-day plan. */}
          <label htmlFor={lineFieldId(line.key, 'description')} style={{ display:'block', fontSize:11, fontWeight:500, color:'var(--txt-mut)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:5 }}>
            Description {!isReadOnly && <Req />}
          </label>
          <input
            id={lineFieldId(line.key, 'description')}
            type="text"
            placeholder="Describe what you worked on (min 3 chars)"
            value={line.description} disabled={isReadOnly}
            maxLength={MAX_DESC}
            aria-required="true"
            aria-invalid={descError ? true : undefined}
            onChange={e => onUpdate({ description:e.target.value })}
            style={{ ...cellStyle, width:'100%', borderColor:descError?'rgba(228,55,61,.6)':'var(--line2)' }}
          />
          {descError && (
            <div role="alert" style={{ fontSize:11, color:showErrors?'var(--risk)':'var(--warn)', marginTop:4 }}>{descError}</div>
          )}
        </div>
        {/* Status — the same control and options as Submit EOD's per-task Status, mandatory on submit. */}
        <div style={{ flex: '0 0 190px', minWidth: 160 }}>
          <TaskStatusField
            id={lineFieldId(line.key, 'status')}
            value={line.taskStatus}
            onChange={v => onUpdate({ taskStatus: v, ...(v !== 'BLOCKED' ? { blockerReason: '' } : null) })}
            readOnly={isReadOnly}
            controlStyle={{ minHeight: 38 }}
            error={statusError}
          />
        </div>
        </div>
        {/* Blocker reason — only while Blocked; routed to the reporting manager on submit. */}
        {line.taskStatus === 'BLOCKED' && (
          <BlockerReasonField
            id={lineFieldId(line.key, 'blockerReason')}
            value={line.blockerReason}
            onChange={v => onUpdate({ blockerReason: v })}
            readOnly={isReadOnly}
            error={reasonError}
          />
        )}
      </div>
    </div>
  );
}
