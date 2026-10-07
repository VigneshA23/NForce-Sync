/**
 * Daily Log — PLAIN_LOG EOD form for PM / Admin / SuperAdmin roles.
 *
 * Design matches SubmitEOD.tsx exactly: same inputStyle (var(--line2), borderRadius 6),
 * same Label primitive, same section spacing (marginTop 24/28), same button style.
 * Layout: plain form on left (no card wrappers) + 320px sticky sidebar on right.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle, Clock, Send, Save, Copy, Plus, Trash2, XCircle,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { todayISO, formatDate, formatTime12h } from '../../lib/date';
import { saveDraft, submitEntry, listEntries, getDayDefaults } from '../../api/eod';
import { useEntryPieces } from '../../api/approvalPieces';
import { useDashboardSummary } from '../../api/employee';
import type { EodEntryDto, EodLogLineDto, SaveLogLineRequest } from '../../api/eod';
import { DatePicker } from '../../components/DatePicker';
import { api } from '../../api/client';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTOSAVE_MS   = 2000;
const MAX_TEXT      = 300;
const MAX_NOTES     = 8000;
const MIN_DESC      = 3;
const MAX_DESC      = 4000;
const QUARTER       = 0.25;
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
interface LogLine { key: number; categoryId: number | null; hours: number; description: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

let _k = 0;
const nextKey   = () => ++_k;
const blankLine = (): LogLine => ({ key: nextKey(), categoryId: null, hours: 0.5, description: '' });
const round25   = (v: number) => Math.round(v / QUARTER) * QUARTER;


function linesFromDto(ll: EodLogLineDto[]): LogLine[] {
  return ll.map(l => ({ key: nextKey(), categoryId: l.categoryId, hours: l.hours, description: l.description }));
}

function sumHours(lines: LogLine[]) {
  return round25(lines.reduce((s, l) => s + l.hours, 0));
}

function entrySignature(date: string, e?: EodEntryDto | null) {
  return e ? `${date}|${e.id}|${e.status}|${new Date(e.updatedAt).getTime()}` : `${date}|none`;
}

function apiErr(err: unknown) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Something went wrong';
}

function editable(entry: EodEntryDto | null | undefined) {
  return !entry || entry.status === 'DRAFT' || entry.status === 'REJECTED';
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── Design tokens — exact copies from SubmitEOD ───────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
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
  const [lines,        setLines]        = useState<LogLine[]>([]);
  const [notes,        setNotes]        = useState('');
  const [isLeave,      setIsLeave]      = useState(false);
  const [dirty,        setDirty]        = useState(false);
  const [confirming,   setConfirming]   = useState(false);
  const [autosaving,   setAutosaving]   = useState(false);
  const [errors,       setErrors]       = useState<string[]>([]);

  const errorRef      = useRef<HTMLDivElement>(null);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedRef    = useRef<string | null>(null);

  const prevDate = (() => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  const nextDate = (() => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading: loadingEntry } = useQuery({
    queryKey: ['eod', 'list', user?.id, selectedDate],
    queryFn:  () => listEntries(undefined, selectedDate, selectedDate),
    enabled:  !!user,
  });

  const { data: categories = [] } = useQuery<TaskCategoryDto[]>({
    queryKey: ['task-categories', 'MANAGEMENT'],
    queryFn:  () => api.get<TaskCategoryDto[]>('/task-categories?scope=MANAGEMENT').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: dayDefaults, isLoading: loadingDD } = useQuery({
    queryKey: ['eod', 'day-defaults', selectedDate],
    queryFn:  () => getDayDefaults(selectedDate),
    staleTime: 0, enabled: !!user,
  });

  const { data: dashboard } = useDashboardSummary();

  const [loadYday, setLoadYday] = useState(false);
  const { data: ydayEntries } = useQuery({
    queryKey: ['eod', 'list', user?.id, prevDate],
    queryFn:  () => listEntries(undefined, prevDate, prevDate),
    enabled:  !!user && loadYday, staleTime: 60_000,
  });

  const entry: EodEntryDto | null = entries[0] ?? null;
  const { data: pieces = [] }     = useEntryPieces(entryId);
  const dailyCap                  = dayDefaults?.workingHoursPerDay ?? 8;

  // ── Populate form ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (loadingEntry || loadingDD) return;
    const sig = entrySignature(selectedDate, entry);
    if (appliedRef.current === sig) return;
    appliedRef.current = sig;

    if (entry) {
      setEntryId(entry.id ?? null); setEntryStatus(entry.status);
      setDayType(entry.dayType ?? 'WORKING_DAY');
      setWorkLocation(entry.workLocation ?? ''); setNextDayPlan(entry.nextDayPlan ?? '');
      setRemarks(entry.remarks ?? ''); setNotes(entry.logNotes ?? '');
      if (entry.entryForm === 'PLAIN_LOG') {
        if (entry.logLines?.length) { setLines(linesFromDto(entry.logLines)); setIsLeave(false); }
        else if ((entry.logTotalHours ?? 0) === 0) { setLines([]); setIsLeave(true); }
        else { setLines([]); setIsLeave(false); }
      }
    } else {
      setEntryId(null); setEntryStatus(null);
      setDayType(dayDefaults?.dayType ?? 'WORKING_DAY');
      setWorkLocation(dayDefaults?.workLocation ?? '');
      setNextDayPlan(''); setRemarks(''); setNotes(''); setLines([]); setIsLeave(false);
    }
    setErrors([]); setDirty(false);
  }, [entries, loadingEntry, selectedDate, dayDefaults, loadingDD]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (errors.length) errorRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }); }, [errors]);
  useEffect(() => { setSP(selectedDate === todayISO() ? {} : { date: selectedDate }, { replace: true }); }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────

  const isEditable   = editable(entry);
  const isReadOnly   = !isEditable;
  const isRejected   = entryStatus === 'REJECTED';
  const isNonWork    = dayType === 'LEAVE' || dayType === 'HOLIDAY';
  const isWeekend    = dayType === 'WEEKEND';
  const wLocDisabled = isNonWork || isWeekend;
  const total        = isLeave ? 0 : sumHours(lines);
  const hoursOver    = total > dailyCap;
  const isToday      = selectedDate === todayISO();
  const isPast       = selectedDate < todayISO();
  const cutoff       = dashboard?.cutoffStatus;
  const cutoffPassed = isToday && (cutoff?.cutoffPassed ?? false);
  const showLate     = (isPast || cutoffPassed) && isEditable;

  const rmPiece      = pieces.find(p => p.approverType === 'REPORTING_MANAGER');
  const managerName  = rmPiece?.approverName ?? null;
  const rejectComment = pieces.find(p => p.status === 'REJECTED')?.comment ?? null;
  const noManager    = !!user && !managerName && pieces.length > 0 && pieces[0]?.approverType !== 'REPORTING_MANAGER';

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDateChange(d: string) { appliedRef.current = null; setSelectedDate(d); setErrors([]); }

  function handleDayTypeChange(v: string) {
    setDayType(v);
    if (v !== 'WORKING_DAY' && v !== 'FIRST_HALF_LEAVE' && v !== 'SECOND_HALF_LEAVE') setWorkLocation('');
    setErrors([]); setDirty(true);
  }

  const addLine    = useCallback(() => { setLines(p => [...p, blankLine()]); setIsLeave(false); setDirty(true); }, []);
  const removeLine = useCallback((key: number) => { setLines(p => p.filter(l => l.key !== key)); setDirty(true); }, []);
  const updateLine = useCallback((key: number, patch: Partial<Omit<LogLine,'key'>>) => {
    setLines(p => p.map(l => l.key === key ? { ...l, ...patch } : l)); setDirty(true);
  }, []);

  const handleCopyYesterday = useCallback(() => {
    if (!loadYday) { setLoadYday(true); return; }
    const prev = ydayEntries?.[0];
    if (!prev || prev.entryForm !== 'PLAIN_LOG') { showToast('error', 'No daily log found for yesterday'); return; }
    if (prev.logLines?.length) { setLines(linesFromDto(prev.logLines)); setIsLeave(false); } else setLines([]);
    setNotes(prev.logNotes ?? ''); setDirty(true); showToast('success', 'Copied from yesterday');
  }, [loadYday, ydayEntries, showToast]);

  useEffect(() => {
    if (!loadYday || !ydayEntries) return;
    const prev = ydayEntries[0];
    if (!prev || prev.entryForm !== 'PLAIN_LOG') return;
    if (prev.logLines?.length) { setLines(linesFromDto(prev.logLines)); setIsLeave(false); } else setLines([]);
    setNotes(prev.logNotes ?? ''); setDirty(true); setLoadYday(false);
    showToast('success', 'Copied from yesterday');
  }, [ydayEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Request builder ───────────────────────────────────────────────────────

  const buildReq = useCallback(() => ({
    entryDate: selectedDate,
    dayType: dayType as 'WORKING_DAY'|'LEAVE'|'HOLIDAY'|'WEEKEND'|'FIRST_HALF_LEAVE'|'SECOND_HALF_LEAVE',
    timeAdjustmentType: null, timeAdjustmentMinutes: null,
    workLocation: wLocDisabled ? null : (workLocation || null),
    nextDayPlan: nextDayPlan || null, remarks: remarks || null,
    tasks: [], attachmentIds: [], entryForm: 'PLAIN_LOG' as const,
    logLines: (isLeave || isNonWork ? [] : lines).map((l, i) => ({
      categoryId: l.categoryId ?? 0, hours: l.hours, description: l.description, sortOrder: i,
    } as SaveLogLineRequest)),
    logNotes: notes.trim() || null,
  }), [selectedDate, dayType, workLocation, nextDayPlan, remarks, lines, notes, isLeave, isNonWork, wLocDisabled]);

  // ── Validation ────────────────────────────────────────────────────────────

  function validate(): string[] {
    if (isNonWork) return [];
    const e: string[] = [];
    if (!wLocDisabled && !workLocation)    e.push('Work location is required.');
    if (!isWeekend && !nextDayPlan.trim()) e.push('Next-day plan is required.');
    if (!isLeave && !isNonWork && lines.some(l =>
      l.categoryId == null || l.hours < QUARTER || l.hours > 24 ||
      l.description.trim().length < MIN_DESC || l.description.trim().length > MAX_DESC))
      e.push('Fix all line items before submitting.');
    if (notes.length       > MAX_NOTES) e.push(`Notes must be under ${MAX_NOTES} characters.`);
    if (nextDayPlan.length > MAX_TEXT)  e.push(`Next-day plan must be under ${MAX_TEXT} characters.`);
    if (remarks.length     > MAX_TEXT)  e.push(`Remarks must be under ${MAX_TEXT} characters.`);
    return e;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: () => saveDraft(buildReq()),
    onSuccess: (saved) => {
      setEntryId(saved.id ?? null); setEntryStatus(saved.status);
      appliedRef.current = entrySignature(selectedDate, saved);
      setDirty(false); qc.invalidateQueries({ queryKey: ['eod'] });
      showToast('success', 'Draft saved');
    },
    onError: (err: unknown) => showToast('error', apiErr(err)),
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const errs = validate();
      if (errs.length) { setErrors(errs); throw new Error('validation'); }
      setErrors([]);
      const saved = await saveDraft(buildReq());
      return submitEntry(saved.id);
    },
    onSuccess: (saved) => {
      setEntryStatus(saved.status);
      appliedRef.current = entrySignature(selectedDate, saved);
      setDirty(false); qc.invalidateQueries({ queryKey: ['eod'] });
      showToast('success', isLeave || isNonWork ? 'Leave day recorded' : 'Daily log submitted');
    },
    onError: (err: unknown) => {
      if ((err as Error).message !== 'validation') showToast('error', apiErr(err));
    },
  });

  // ── Autosave ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!dirty || !isEditable) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setAutosaving(true);
      try {
        const saved = await saveDraft(buildReq());
        setEntryId(saved.id ?? null); setEntryStatus(saved.status);
        appliedRef.current = entrySignature(selectedDate, saved);
        qc.invalidateQueries({ queryKey: ['eod'] });
      } catch { /* silent */ }
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
    <div style={{ maxWidth: 1140, margin: '0 auto' }}>

      {/* ── Header (SubmitEOD PageHeader style) ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button
            onClick={() => handleDateChange(prevDate)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:6, background:'var(--raised2)', border:'1px solid var(--line2)', cursor:'pointer', color:'var(--txt-mut)', flexShrink:0 }}
            aria-label="Previous day"
          >
            <ChevronLeft size={15} />
          </button>
          <h1 style={{ fontFamily:'"Inter","Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif', fontSize:26, fontWeight:700, color:'var(--txt)', margin:0, letterSpacing:'-0.01em' }}>
            Daily Log
          </h1>
          <button
            onClick={() => handleDateChange(nextDate)}
            disabled={isToday}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:6, background:'var(--raised2)', border:'1px solid var(--line2)', cursor:isToday?'not-allowed':'pointer', color:isToday?'var(--line)':'var(--txt-mut)', flexShrink:0 }}
            aria-label="Next day"
          >
            <ChevronRight size={15} />
          </button>
          {isPast && (
            <button
              onClick={() => handleDateChange(todayISO())}
              style={{ padding:'4px 10px', borderRadius:20, background:'var(--raised2)', border:'1px solid var(--line2)', color:'var(--txt-mut)', fontSize:11, fontWeight:500, cursor:'pointer' }}
            >
              Today
            </button>
          )}
        </div>
        {entryStatus && <StatusBadge status={entryStatus} />}
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

      {showLate && (
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 16px', borderRadius:8, marginBottom:16, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.3)' }}>
          <Clock size={15} style={{ color:'#E0A93B', flexShrink:0, marginTop:1 }} aria-hidden />
          <div>
            {isToday && cutoffPassed && cutoff?.cutoffTime
              ? <><div style={{ fontSize:13, color:'var(--txt)', fontWeight:500 }}>Submission window closed at {formatTime12h(cutoff.cutoffTime)} IST.</div><div style={{ fontSize:12, color:'var(--txt-mut)', marginTop:2 }}>Entries submitted after the cutoff are accepted and marked late.</div></>
              : <><div style={{ fontSize:13, color:'var(--txt)', fontWeight:500 }}>Submitting for a past date.</div><div style={{ fontSize:12, color:'var(--txt-mut)', marginTop:2 }}>This entry will be marked late.</div></>}
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

      {/* ── Two-column layout ── */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 310px', gap:28, alignItems:'start' }}>

        {/* ══════════════════════════════════════ LEFT: form (SubmitEOD style) */}
        <div>

          {/* Meta row — Entry date | Day type | Work location (matches SubmitEOD) */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16, marginTop:24 }}>
            <div>
              <Label>Entry date</Label>
              <DatePicker value={selectedDate} onChange={handleDateChange} max={todayISO()} inputStyle={inputStyle} />
            </div>
            <div>
              <Label>Day type <Req /></Label>
              {isReadOnly
                ? <div style={{ ...inputStyle, opacity:0.7 }}>{DAY_TYPES.find(d => d.value===dayType)?.label ?? dayType}</div>
                : <Sel value={dayType} onChange={e => handleDayTypeChange(e.target.value)}>
                    {DAY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
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
          {(isNonWork || isLeave) && (
            <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'12px 16px', borderRadius:8, marginTop:24, background:'rgba(47,182,124,.08)', border:'1px solid rgba(47,182,124,.3)' }}>
              <CheckCircle size={15} style={{ color:'var(--ok)', flexShrink:0, marginTop:1 }} aria-hidden />
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--ok)', marginBottom:2 }}>No tasks required</div>
                <div style={{ fontSize:12, color:'var(--txt-mut)', lineHeight:1.5 }}>
                  {dayType==='LEAVE' || isLeave ? 'Leave day — this entry will be auto-approved.'
                    : dayType==='HOLIDAY' ? 'Company holiday — this entry will be auto-approved.'
                    : 'Weekend — no line items required.'}
                </div>
              </div>
            </div>
          )}

          {/* ── Time breakdown section (SubmitEOD Tasks section style) ── */}
          {!isNonWork && (
            <div style={{ marginTop:28 }}>
              {/* Section header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--txt-mut)', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                  Time breakdown
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {isEditable && (
                    <button onClick={handleCopyYesterday} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--txt-dim)' }}>
                      <Copy size={12} />Copy yesterday
                    </button>
                  )}
                  {lines.length > 0 && !isLeave && (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:72, height:5, borderRadius:3, background:'var(--line2)', overflow:'hidden' }} aria-hidden>
                        <div style={{ height:'100%', borderRadius:3, transition:'width 200ms ease', width:`${Math.min(100,(total/Math.max(0.01,dailyCap))*100)}%`, background:hoursOver?'var(--warn)':'var(--ok)' }} />
                      </div>
                      <div style={{ fontSize:13, color:'var(--txt-mut)', fontVariantNumeric:'tabular-nums' }}>
                        <span style={{ color:'var(--txt)', fontWeight:600 }}>{total.toFixed(1)}</span>
                        {' '}/ {dailyCap.toFixed(1)} hrs
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Legacy notice */}
              {entry?.entryForm==='PLAIN_LOG' && !entry.logLines?.length && (entry.logTotalHours??0)>0 && isEditable && (
                <div style={{ padding:'12px 14px', borderRadius:8, marginBottom:12, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.2)', fontSize:12, color:'var(--warn)' }}>
                  Legacy entry format. Add line items below to convert.
                  {entry.logSummary && <div style={{ marginTop:6, color:'var(--txt-dim)', whiteSpace:'pre-wrap' }}>{entry.logSummary}</div>}
                </div>
              )}

              {/* Empty state — editable */}
              {lines.length===0 && !isLeave && isEditable && (
                <div style={{ padding:'28px 20px', borderRadius:8, textAlign:'center', border:'1px dashed var(--line2)', color:'var(--txt-dim)', fontSize:13 }}>
                  Add line items to log your time, or mark the day as leave below.
                </div>
              )}

              {/* Empty state — read-only submitted with no lines */}
              {lines.length===0 && !isLeave && isReadOnly && (
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
                    isReadOnly={isReadOnly}
                    onUpdate={patch => updateLine(line.key, patch)}
                    onRemove={() => removeLine(line.key)}
                  />
                ))}
              </div>

              {/* Overtime note */}
              {hoursOver && !isLeave && (
                <div style={{ display:'flex', gap:6, alignItems:'center', fontSize:12, color:'var(--warn)', marginTop:10, fontWeight:500 }}>
                  <AlertTriangle size={13} />
                  Logging overtime — your manager will be notified on approval.
                </div>
              )}

              {/* No-categories warning */}
              {isEditable && !isLeave && categories.length === 0 && lines.length > 0 && (
                <div style={{ display:'flex', gap:8, alignItems:'center', padding:'9px 13px', borderRadius:7, marginTop:6, background:'rgba(224,169,59,.08)', border:'1px solid rgba(224,169,59,.25)', fontSize:12, color:'var(--warn)' }}>
                  <AlertTriangle size={13} />
                  No categories configured. Go to <strong style={{ color:'var(--txt)', marginLeft:3 }}>Org Masters → Task Categories</strong> and add categories with scope "Management".
                </div>
              )}

              {/* Add line */}
              {isEditable && !isLeave && (
                <button
                  onClick={addLine}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:6, marginTop:10, background:'transparent', border:'1px dashed var(--line2)', color:'var(--txt-mut)', fontSize:13, cursor:'pointer', transition:'border-color 120ms, color 120ms' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--brand)'; (e.currentTarget as HTMLButtonElement).style.color='var(--txt)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor='var(--line2)'; (e.currentTarget as HTMLButtonElement).style.color='var(--txt-mut)'; }}
                >
                  <Plus size={14} aria-hidden />Add line item
                </button>
              )}

              {/* Leave toggle */}
              {isEditable && lines.length===0 && (
                <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:12 }}>
                  <button
                    onClick={() => { setIsLeave(v => !v); setDirty(true); }}
                    style={{
                      padding:'8px 18px', borderRadius:6, fontSize:13, fontWeight:500, cursor:'pointer',
                      background: isLeave ? 'var(--brand)' : 'var(--raised2)',
                      border: `1px solid ${isLeave ? 'var(--brand-deep)' : 'var(--line2)'}`,
                      color: isLeave ? '#fff' : 'var(--txt)',
                    }}
                  >
                    {isLeave ? 'Cancel leave' : 'Mark as leave day'}
                  </button>
                  {isLeave && <span style={{ fontSize:12, color:'var(--txt-dim)' }}>Auto-approved — no manager review needed.</span>}
                </div>
              )}
            </div>
          )}

          {/* Next-day plan */}
          {!isNonWork && !isWeekend && (
            <div style={{ marginTop:24 }}>
              <Label>Next-day plan {!isWeekend && <Req />}</Label>
              {isReadOnly
                ? <div style={{ ...inputStyle, opacity:0.7, minHeight:60, lineHeight:1.5 }}>{nextDayPlan || '-'}</div>
                : <>
                    <Txt value={nextDayPlan} onChange={e => { setNextDayPlan(e.target.value); setDirty(true); }} placeholder="What are you planning to work on tomorrow?" rows={3} maxLength={MAX_TEXT} />
                    <CharCount value={nextDayPlan} />
                  </>}
            </div>
          )}

          {/* Remarks */}
          <div style={{ marginTop:16 }}>
            <Label>Remarks <span style={{ color:'var(--txt-dim)', textTransform:'none', fontWeight:400, letterSpacing:0 }}>(optional)</span></Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity:0.7, minHeight:50, lineHeight:1.5 }}>{remarks || '-'}</div>
              : <>
                  <Txt value={remarks} onChange={e => { setRemarks(e.target.value); setDirty(true); }} placeholder="Any blockers, dependencies, or context for your manager?" rows={2} maxLength={MAX_TEXT} />
                  <CharCount value={remarks} />
                </>}
          </div>

          {/* Additional notes */}
          <div style={{ marginTop:16 }}>
            <Label>Additional notes <span style={{ color:'var(--txt-dim)', textTransform:'none', fontWeight:400, letterSpacing:0 }}>(optional, private)</span></Label>
            {isReadOnly
              ? <div style={{ ...inputStyle, opacity:0.7, lineHeight:1.5 }}>{notes || '-'}</div>
              : <>
                  <Txt value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} placeholder="Extended notes for your own record — not visible to your reviewer." rows={3} maxLength={MAX_NOTES} style={{ minHeight:80 }} />
                  <div style={{ fontSize:11, color:notes.length>MAX_NOTES?'var(--risk)':'var(--txt-dim)', textAlign:'right', marginTop:4 }}>{notes.length}/{MAX_NOTES}</div>
                </>}
          </div>

          {/* ── Action buttons (SubmitEOD style — right-aligned) ── */}
          {isEditable && !confirming && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, marginTop:28 }}>
              {autosaving && <div style={{ fontSize:12, color:'var(--txt-dim)' }}>Saved just now</div>}
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
                  disabled={saveMut.isPending || submitMut.isPending}
                  style={{ padding:'9px 22px', borderRadius:6, background:'var(--brand)', border:'1px solid var(--brand-deep)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', boxShadow:'0 2px 8px color-mix(in srgb, var(--brand) 35%, transparent)', display:'flex', alignItems:'center', gap:7 }}
                >
                  <Send size={14} />
                  {isLeave || isNonWork ? 'Record leave' : 'Submit log'}
                </button>
              </div>
            </div>
          )}

          {/* Confirmation dialog */}
          {isEditable && confirming && (
            <div style={{ marginTop:20, padding:'16px 18px', borderRadius:8, background:'rgba(177,17,22,.06)', border:'1px solid rgba(177,17,22,.2)' }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', marginBottom:6 }}>
                {isLeave || isNonWork ? 'Record this as a leave day?' : `Submit your daily log for ${formatDate(selectedDate)}?`}
              </div>
              <div style={{ fontSize:12, color:'var(--txt-mut)', marginBottom:14 }}>
                {isLeave || isNonWork
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

        {/* ══════════════════════════════════════ RIGHT SIDEBAR */}
        <div style={{ display:'flex', flexDirection:'column', gap:16, position:'sticky', top:24 }}>
          {cutoff && isToday && (
            <CutoffCard cutoffTime={cutoff.cutoffTime} cutoffPassed={cutoff.cutoffPassed} cutoffNextDay={cutoff.cutoffNextDay} />
          )}
          <ReviewerCard entry={entry} pieces={pieces} />
          <HowItWorksCard />
        </div>

      </div>
    </div>
  );
}

// ── LineRow (SubmitEOD group-card style) ──────────────────────────────────────

interface LineRowProps {
  line: LogLine; index: number; categories: TaskCategoryDto[];
  isReadOnly: boolean;
  onUpdate: (p: Partial<Omit<LogLine,'key'>>) => void;
  onRemove: () => void;
}

function LineRow({ line, index, categories, isReadOnly, onUpdate, onRemove }: LineRowProps) {
  const descLen = line.description.length;
  const descOk  = descLen >= MIN_DESC && descLen <= MAX_DESC;
  const hoursOk = line.hours >= QUARTER && line.hours <= 24;
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
          value={line.categoryId ?? ''}
          disabled={isReadOnly || categories.length === 0}
          onChange={e => onUpdate({ categoryId: e.target.value ? Number(e.target.value) : null })}
          style={{ ...cellStyle, flex:1, cursor:(isReadOnly||categories.length===0)?'default':'pointer', borderColor:line.categoryId==null&&!isReadOnly?'rgba(228,55,61,.4)':'var(--line2)' }}
        >
          <option value="">{categories.length === 0 ? 'No categories — configure in Org Masters' : 'Select category…'}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="number" min={QUARTER} max={24} step={QUARTER}
          value={line.hours} disabled={isReadOnly}
          onChange={e => { const v=round25(parseFloat(e.target.value)||QUARTER); onUpdate({ hours:Math.min(24,Math.max(QUARTER,v)) }); }}
          style={{ ...cellStyle, width:64, textAlign:'right', fontFamily:'"JetBrains Mono",monospace', fontWeight:700, borderColor:!hoursOk&&!isReadOnly?'rgba(228,55,61,.4)':'var(--line2)' }}
        />
        <span style={{ fontSize:12, color:'var(--txt-dim)', flexShrink:0 }}>h</span>
        {!isReadOnly && (
          <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--risk)', padding:4, flexShrink:0 }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {/* Hour chips + description */}
      <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {!isReadOnly && (
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {CHIPS.map(v => (
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
        <div>
          <input
            type="text"
            placeholder="Describe what you worked on (min 3 chars)"
            value={line.description} disabled={isReadOnly}
            maxLength={MAX_DESC}
            onChange={e => onUpdate({ description:e.target.value })}
            style={{ ...cellStyle, width:'100%', borderColor:!descOk&&line.description.length>0&&!isReadOnly?'rgba(228,55,61,.4)':'var(--line2)' }}
          />
          {!descOk && line.description.length>0 && line.description.length<MIN_DESC && (
            <div style={{ fontSize:11, color:'var(--warn)', marginTop:4 }}>Minimum {MIN_DESC} characters required</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar components ────────────────────────────────────────────────────────

const SIDEBAR_CARD: React.CSSProperties = {
  background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden',
};

const SIDEBAR_HEAD: React.CSSProperties = {
  padding: '11px 16px', borderBottom: '1px solid var(--line)',
  fontSize: 11, fontWeight: 700, color: 'var(--txt-mut)',
  letterSpacing: '0.08em', textTransform: 'uppercase',
  display: 'flex', alignItems: 'center', gap: 7,
};

const PIECE_STATUS_CFG: Record<string, { color: string; label: string; Icon: typeof CheckCircle }> = {
  APPROVED: { color: '#2FB67C', label: 'Approved', Icon: CheckCircle },
  REJECTED: { color: '#E4373D', label: 'Rejected', Icon: XCircle    },
  PENDING:  { color: '#4C8DD6', label: 'Pending',  Icon: Clock       },
};

function CutoffCard({ cutoffTime, cutoffPassed, cutoffNextDay }: { cutoffTime: string|null; cutoffPassed: boolean; cutoffNextDay: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  if (!cutoffTime) return null;

  const [hh, mm]   = cutoffTime.split(':').map(Number);
  const cutoffDate = new Date(now);
  if (cutoffNextDay) cutoffDate.setDate(cutoffDate.getDate() + 1);
  cutoffDate.setHours(hh, mm, 0, 0);

  const diffMs   = cutoffDate.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const h        = Math.floor(diffMins / 60);
  const m        = diffMins % 60;
  const passed   = cutoffPassed || diffMs <= 0;
  const urgent   = !passed && diffMins < 60;
  const color    = passed ? '#E4373D' : urgent ? '#E0A93B' : '#2FB67C';
  const timeStr  = passed ? 'Closed' : h > 0 ? `${h}h ${m}m` : `${m}m`;

  return (
    <div style={{ ...SIDEBAR_CARD, borderColor: passed?'rgba(228,55,61,.3)':urgent?'rgba(224,169,59,.3)':'rgba(47,182,124,.25)' }}>
      <div style={{ ...SIDEBAR_HEAD, borderBottomColor: passed?'rgba(228,55,61,.2)':urgent?'rgba(224,169,59,.2)':'var(--line)', color }}>
        <Clock size={12} color={color} />
        Submission window
      </div>
      <div style={{ padding:'18px 16px', textAlign:'center' }}>
        <div style={{ fontSize:passed?20:34, fontWeight:800, color, fontFamily:'"JetBrains Mono",monospace', letterSpacing:'-0.02em', lineHeight:1 }}>
          {timeStr}
        </div>
        <div style={{ fontSize:12, color:'var(--txt-dim)', marginTop:6 }}>
          {passed ? 'Late submissions still accepted.' : urgent ? 'until cutoff — submit soon' : 'remaining to submit on time'}
        </div>
        <div style={{ marginTop:12, padding:'7px 10px', borderRadius:6, background:'var(--raised2)', border:'1px solid var(--line)', fontSize:11, color:'var(--txt-dim)' }}>
          Closes at {formatTime12h(cutoffTime)}{cutoffNextDay?' (next day)':' today'}
        </div>
      </div>
    </div>
  );
}

function ReviewerCard({ entry, pieces }: {
  entry: EodEntryDto|null;
  pieces: import('../../api/approvalPieces').ApprovalPieceDto[];
}) {
  const typeLabel = (t: string) =>
    t==='REPORTING_MANAGER'?'Reporting Manager':t==='ADMIN_GROUP'?'Admin Group':t==='AUTO_APPROVED'?'Auto-approved':t;

  if (!entry || !pieces.length) {
    return (
      <div style={SIDEBAR_CARD}>
        <div style={SIDEBAR_HEAD}><CheckCircle size={12} />Approval</div>
        <div style={{ padding:'20px 16px', textAlign:'center' }}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--raised2)', border:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
            <Clock size={17} color="var(--txt-dim)" />
          </div>
          <div style={{ fontSize:13, color:'var(--txt-dim)', lineHeight:1.6 }}>
            Submit your daily log to see the reviewer assigned to your entry.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={SIDEBAR_CARD}>
      <div style={SIDEBAR_HEAD}><CheckCircle size={12} />Approval</div>
      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {pieces.map(p => {
          const cfg  = PIECE_STATUS_CFG[p.status] ?? PIECE_STATUS_CFG.PENDING;
          const Icon = cfg.Icon;
          return (
            <div key={p.id} style={{ padding:'12px 13px', borderRadius:9, background:'var(--raised2)', border:'1px solid var(--line)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:`${cfg.color}18`, border:`1.5px solid ${cfg.color}40`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:cfg.color }}>
                    {p.approverName ? initials(p.approverName) : '—'}
                  </span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.approverName ?? typeLabel(p.approverType)}
                  </div>
                  <div style={{ fontSize:11, color:'var(--txt-dim)', marginTop:1 }}>{typeLabel(p.approverType)}</div>
                </div>
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:20, background:`${cfg.color}18`, border:`1px solid ${cfg.color}40`, fontSize:10, fontWeight:700, color:cfg.color, flexShrink:0 }}>
                  <Icon size={10} />{cfg.label}
                </span>
              </div>
              {p.comment && (
                <div style={{ marginTop:9, padding:'8px 10px', borderRadius:7, background:'rgba(228,55,61,.07)', border:'1px solid rgba(228,55,61,.2)', fontSize:12, color:'var(--txt)', lineHeight:1.55 }}>
                  {p.comment}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HowItWorksCard() {
  return (
    <div style={SIDEBAR_CARD}>
      <div style={SIDEBAR_HEAD}><Clock size={12} />How it works</div>
      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {[
          'Select your day type and work location.',
          'Add category line items for your time breakdown.',
          'Fill in your next-day plan, then submit.',
          'Leave or holiday days are auto-approved instantly.',
          'Rejected logs can be edited and resubmitted.',
        ].map((text, i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ width:20, height:20, borderRadius:'50%', background:'var(--raised2)', border:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--txt-dim)' }}>{i+1}</span>
            </div>
            <span style={{ fontSize:12, color:'var(--txt-mut)', lineHeight:1.65 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
