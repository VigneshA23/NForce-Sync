import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock, XCircle, MessageSquare } from 'lucide-react';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { todayISO, formatDate } from '../../lib/date';
import { listProjects } from '../../api/projects';
import { listTaskCategories } from '../../api/taskCategories';
import { saveDraft, submitEntry, listEntries } from '../../api/eod';
import type { EodEntryDto, EodTaskDto } from '../../api/eod';

// ── Constants ──────────────────────────────────────────────────────────────────

const TASK_STATUSES = [
  { value: 'COMPLETED',   label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'BLOCKED',     label: 'Blocked' },
  { value: 'NOT_STARTED', label: 'Not Started' },
];

const WORK_LOCATIONS = ['Office', 'Remote', 'Client Site', 'Field'];
const LEAVE_HOLIDAY   = 'Leave / Holiday';


// ── Local task row type ────────────────────────────────────────────────────────

interface TaskRow {
  localId: string;
  projectId: number | null;
  /** Code as saved on the entry. Survives an allocation ending, which would drop the
   *  project from the (allocation-scoped) dropdown and leave nothing to resolve against. */
  projectCode: string | null;
  taskCategoryId: number | null;
  categoryName: string | null;
  isBillableDefault: boolean;
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
    isBillableDefault: true,
    description:      '',
    hours:            '',
    taskStatus:       'COMPLETED',
    isBillable:       true,
    blockerReason:    '',
    supportNeeded:    '',
  };
}

function rowFromDto(dto: EodTaskDto, isBillableDefault: boolean): TaskRow {
  return {
    localId:          `row-${++rowSeq}`,
    projectId:        dto.projectId,
    projectCode:      dto.projectCode,
    taskCategoryId:   dto.taskCategoryId,
    categoryName:     dto.categoryName,
    isBillableDefault,
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
    CHANGES_REQUESTED: { color: '#E0A93B', label: 'Changes Requested', Icon: MessageSquare },
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
  const [workLocation, setWorkLocation] = useState('');
  const [nextDayPlan,  setNextDayPlan]  = useState('');
  const [remarks,      setRemarks]      = useState('');
  const [tasks,        setTasks]        = useState<TaskRow[]>([newRow()]);
  const [reviewerComment, setReviewerComment] = useState<string | null>(null);

  // Validation errors (client-side)
  const [errors, setErrors] = useState<string[]>([]);

  // Track if form has been populated from the query for the current date
  const appliedDateRef = useRef<string | null>(null);

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

  // ── Populate form when entry loads for the selected date ──────────────────

  useEffect(() => {
    if (loadingEntry) return;
    if (appliedDateRef.current === selectedDate) return; // already applied
    appliedDateRef.current = selectedDate;

    const entry: EodEntryDto | undefined = entries[0];
    if (entry) {
      setEntryId(entry.id);
      setEntryStatus(entry.status);
      setWorkLocation(entry.workLocation ?? '');
      setNextDayPlan(entry.nextDayPlan ?? '');
      setRemarks(entry.remarks ?? '');
      setReviewerComment(entry.reviewerComment ?? null);

      const catMap = new Map(categories.map(c => [c.id, c]));
      setTasks(entry.tasks.length > 0
        ? entry.tasks.map(t => rowFromDto(t, catMap.get(t.taskCategoryId ?? 0)?.isBillableDefault ?? true))
        : [newRow()],
      );
    } else {
      setEntryId(null);
      setEntryStatus(null);
      setWorkLocation('');
      setNextDayPlan('');
      setRemarks('');
      setReviewerComment(null);
      setTasks([newRow()]);
    }
    setErrors([]);
  }, [entries, loadingEntry, selectedDate, categories]);

  // Reset appliedDateRef when date changes so the next query result repopulates
  function handleDateChange(d: string) {
    appliedDateRef.current = null;
    setSelectedDate(d);
    setErrors([]);
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const isReadOnly   = entryStatus === 'SUBMITTED' || entryStatus === 'APPROVED' || entryStatus === 'MISSED';
  const isEditable   = !isReadOnly;
  const totalHours   = tasks.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0);
  const catMap       = new Map(categories.map(c => [c.id, c]));

  // ── Mutations ──────────────────────────────────────────────────────────────

  const draftMutation = useMutation({
    mutationFn: saveDraft,
    onSuccess: (entry) => {
      setEntryId(entry.id);
      setEntryStatus(entry.status);
      setReviewerComment(null);
      appliedDateRef.current = selectedDate; // don't re-populate from refetch
      qc.invalidateQueries({ queryKey: ['eod'] });
      toast('Draft saved');
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
      appliedDateRef.current = selectedDate;
      qc.invalidateQueries({ queryKey: ['eod'] });
      toast('EOD submitted successfully');
    },
    onError: (err: unknown) => {
      toast(extractError(err), 'error');
    },
  });

  // ── Client-side validation ────────────────────────────────────────────────

  function validate(): string[] {
    const errs: string[] = [];
    if (tasks.length === 0) { errs.push('Add at least one task.'); return errs; }
    tasks.forEach((t, i) => {
      const n = i + 1;
      if (!t.projectId)      errs.push(`Task ${n}: project is required.`);
      if (!t.taskCategoryId) errs.push(`Task ${n}: category is required.`);
      if (t.hours === '' || isNaN(parseFloat(t.hours))) {
        if (t.categoryName !== LEAVE_HOLIDAY) errs.push(`Task ${n}: hours are required.`);
      }
      if (parseFloat(t.hours) < 0) errs.push(`Task ${n}: hours cannot be negative.`);
      if (t.taskStatus === 'BLOCKED' && !t.blockerReason.trim()) {
        errs.push(`Task ${n}: blocker reason is required when status is Blocked.`);
      }
    });
    return errs;
  }

  // ── Action handlers ───────────────────────────────────────────────────────

  function buildRequest() {
    return {
      entryDate:    selectedDate,
      workLocation: workLocation || null,
      nextDayPlan:  nextDayPlan  || null,
      remarks:      remarks      || null,
      tasks: tasks.map(t => ({
        projectId:      t.projectId,
        taskCategoryId: t.taskCategoryId,
        description:    t.description || null,
        hours:          t.categoryName === LEAVE_HOLIDAY ? 0 : (parseFloat(t.hours) || 0),
        taskStatus:     t.taskStatus,
        isBillable:     t.isBillable,
        blockerReason:  t.blockerReason || null,
        supportNeeded:  t.supportNeeded || null,
      })),
    };
  }

  function handleSaveDraft() {
    setErrors([]);
    draftMutation.mutate(buildRequest());
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
    const isLeave = cat?.name === LEAVE_HOLIDAY;
    updateTask(localId, {
      taskCategoryId:   id,
      categoryName:     cat?.name ?? null,
      isBillableDefault: cat?.isBillableDefault ?? true,
      isBillable:        cat?.isBillableDefault ?? true,
      hours:             isLeave ? '0' : '',
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
        onDateChange={isReadOnly ? undefined : handleDateChange}
        entryStatus={entryStatus}
      />

      {/* Reviewer feedback banner */}
      {reviewerComment && (entryStatus === 'REJECTED' || entryStatus === 'CHANGES_REQUESTED') && (
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
        <div style={{
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
            <div>
              <Label>Entry date</Label>
              <Inp
                type="date"
                lang="en-GB"
                value={selectedDate}
                onChange={e => handleDateChange(e.target.value)}
                disabled={isReadOnly}
                max={todayISO()}
              />
            </div>
            <div>
              <Label>Work location</Label>
              {isReadOnly ? (
                <div style={{ ...inputStyle, opacity: 0.7 }}>{workLocation || '—'}</div>
              ) : (
                <Sel value={workLocation} onChange={e => setWorkLocation(e.target.value)}>
                  <option value="">— Select —</option>
                  {WORK_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </Sel>
              )}
            </div>
          </div>

          {/* Tasks section */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-mut)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Tasks
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: 'var(--txt-mut)' }}>
                <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{totalHours.toFixed(1)}</span>
                {' '}hrs total
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

          {/* Next-day plan */}
          <div style={{ marginTop: 24 }}>
            <Label>Next-day plan</Label>
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
  projects: { id: number; code: string; name: string; client: string | null }[];
  categories: { id: number; name: string; isProductive: boolean; isBillableDefault: boolean }[];
  isReadOnly: boolean;
  onUpdate: (patch: Partial<TaskRow>) => void;
  onRemove: () => void;
  onCategoryChange: (catId: string) => void;
  canRemove: boolean;
}

function TaskCard({ task, index, projects, categories, isReadOnly, onUpdate, onRemove, onCategoryChange, canRemove }: TaskCardProps) {
  const isLeave   = task.categoryName === LEAVE_HOLIDAY;
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
              <Sel value={task.projectId ?? ''} onChange={e => onUpdate({ projectId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Project —</option>
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
                <option value="">— Category —</option>
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
              value={isLeave ? '0' : task.hours}
              onChange={e => onUpdate({ hours: e.target.value })}
              disabled={isReadOnly || isLeave}
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
              placeholder="0"
            />
          </div>
          {/* Status */}
          <div>
            <Label>Status</Label>
            {isReadOnly ? (
              <div style={{ ...inputStyle, fontSize: 12, color: statusColor[task.taskStatus] ?? 'var(--txt)' }}>
                {TASK_STATUSES.find(s => s.value === task.taskStatus)?.label ?? task.taskStatus}
              </div>
            ) : (
              <Sel value={task.taskStatus} onChange={e => onUpdate({ taskStatus: e.target.value })}>
                {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Sel>
            )}
          </div>
          {/* Billable + remove */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label>Billable</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 2 }}>
              <input
                type="checkbox"
                id={`bill-${task.localId}`}
                checked={task.isBillable}
                onChange={e => onUpdate({ isBillable: e.target.checked })}
                disabled={isReadOnly}
                style={{ width: 14, height: 14, accentColor: 'var(--brand)', cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
              />
              {!isReadOnly && canRemove && (
                <button
                  onClick={onRemove}
                  title="Remove task"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-dim)', padding: 2, display: 'flex', marginLeft: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#E4373D')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--txt-dim)')}
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </div>
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
