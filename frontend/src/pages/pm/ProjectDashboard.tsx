import { useMemo, useRef, useState } from 'react';
import {
  FolderKanban, CheckCircle2, PauseCircle, Archive, Gauge, Briefcase, Ban,
  Target, TrendingUp, AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { KpiCard } from '../../components/KpiCard';
import { useIsPhone } from '../../lib/useMediaQuery';
import {
  useProjectDashboardFilters, useProjectDashboardSummary,
  type MissingEodRowDto, type ProjectUtilizationRowDto, type ResourceUtilizationRowDto,
} from '../../api/projectDashboard';

// ── shared local styles (matches ProjectsAllocation.tsx conventions) ──────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--txt)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--txt-dim)',
  textAlign: 'left',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: 'var(--raised)',
  borderBottom: '1px solid var(--line)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  color: 'var(--txt)',
};

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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

/** Same header layout/styling as the original Resource Utilization search — reused so every
 *  searchable section stays visually consistent, regardless of what it searches by. */
function SectionHeaderWithSearch({ title, subtitle, search, onSearchChange, placeholder = 'Search employee' }: {
  title: string; subtitle?: string; search: string; onSearchChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <input
        type="search"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ ...inputStyle, width: 200, fontWeight: 400 }}
      />
    </div>
  );
}

/** Trailing-edge debounce — same local pattern as ProjectsAllocation.tsx (no shared debounce util exists). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return debounced;
}

type SortDir = 'asc' | 'desc';

function SortableTh({ label, active, dir, onToggle }: {
  label: string; active: boolean; dir: SortDir; onToggle: () => void;
}) {
  return (
    <th style={{ ...thStyle, padding: 0 }} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          width: '100%', padding: '10px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          font: 'inherit', color: active ? 'var(--txt)' : 'var(--txt-dim)',
          letterSpacing: 'inherit', textTransform: 'inherit', textAlign: 'left',
        }}
      >
        {label}
        {active
          ? (dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)
          : <ArrowUpDown size={12} aria-hidden="true" style={{ opacity: 0.55 }} />}
      </button>
    </th>
  );
}

function fmtHours(n: number): string {
  return `${n.toFixed(1)}h`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function utilColor(pct: number): string {
  if (pct >= 100) return 'var(--risk)';
  if (pct >= 70) return 'var(--ok)';
  if (pct >= 40) return 'var(--warn)';
  return 'var(--txt-dim)';
}

const MISSING_STATUS_CFG: Record<MissingEodRowDto['status'], { color: string; label: string }> = {
  AT_RISK: { color: 'var(--risk)', label: 'At Risk' },
  MISSING: { color: 'var(--warn)', label: 'Missing' },
};

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
    }}>
      {label}
    </span>
  );
}

// ── date range filter ────────────────────────────────────────────────────────
// DD / MM / YYYY are each their own <input> here, not one text field with a rebuild-the-whole-
// string mask — a single-field digit mask can't tell "the digits that used to be YYYY" apart
// from "the digits that used to be MM" once any middle portion is cleared, so clearing one
// component was sliding the others into its place. Three independently-bounded (maxLength 2/2/4)
// inputs make that structurally impossible: clearing DD can only ever touch DD's own state.
// Explicit calendar/leap-year arithmetic (never `new Date()` parsing/normalization), a
// future-date check for To, and a From <= To check are unchanged, and still funnel through one
// validation path shared by both manual typing and the calendar picker. Kept local to this page
// rather than folded into the shared `components/DatePicker.tsx`, since that component is also
// used by Submit EOD, Admin User Management, and two other PM report pages that this change
// must not touch.

const MIN_ISO_DATE = '1900-01-01';
const MAX_ISO_DATE = '2099-12-31';
const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

const DDMMYYYY_RE = /^(\d{2})-(\d{2})-(\d{4})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(month: number, year: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** Strictly parses `DD-MM-YYYY` into `YYYY-MM-DD` by digit-count regex plus arithmetic
 * range/leap-year checks — never by constructing a `Date` and reading back whatever it
 * silently normalized to. Returns `null` for anything that isn't a genuine calendar date. */
function parseStrictDDMMYYYY(text: string): string | null {
  const m = DDMMYYYY_RE.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** One date field's three independent segments, as raw (possibly partial) digit strings. */
interface DateParts { day: string; month: string; year: string }

const EMPTY_PARTS: DateParts = { day: '', month: '', year: '' };

/** `YYYY-MM-DD` → `{ day, month, year }`, for seeding the three segment inputs from a
 * calendar-picker selection or the parent's committed value. */
function isoToParts(iso: string): DateParts {
  if (!iso) return EMPTY_PARTS;
  const [year, month, day] = iso.split('-');
  return { day, month, year };
}

function partsAreEmpty(p: DateParts): boolean {
  return p.day === '' && p.month === '' && p.year === '';
}

/** True once every segment has been typed out to its full width — the only point at which a
 * date is complete enough to run calendar validation on; anything short of this is still
 * mid-edit and must be treated as neither valid nor an error. */
function partsAreComplete(p: DateParts): boolean {
  return p.day.length === 2 && p.month.length === 2 && p.year.length === 4;
}

function partsToDDMMYYYY(p: DateParts): string {
  return `${p.day}-${p.month}-${p.year}`;
}

// Both sides are always fixed-width, zero-padded `YYYY-MM-DD` by this point, so a plain
// string comparison is chronologically correct — no Date object, no timezone risk.
function isRangeValid(from: string, to: string): boolean {
  if (from === '' || to === '') return true;
  return from <= to;
}

/** Today as zero-padded `YYYY-MM-DD`, read from local date parts (never UTC/`toISOString`,
 * which can shift the calendar day depending on the browser's timezone offset). */
function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** The 1st of the current local month, as `YYYY-MM-DD` — the dashboard's default From date on
 * every fresh login, computed off today's actual local date rather than any fixed month/year. */
function firstDayOfMonthIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Strips everything but digits and caps to `max` — the only transform a segment's own value
 * ever goes through; the native `maxLength` attribute backs this up for paste as well. */
function digitsOnly(raw: string, max: number): string {
  return raw.replace(/\D/g, '').slice(0, max);
}

/** Whether the dashboard should show data at all: 'ready' covers both a fully valid From+To
 * pair and both-empty (falls back to the backend's own default range); 'invalid' — bad
 * format, an incomplete pair, a future To date, or From > To — must never show data, so the
 * page renders a validation notice instead. */
type DateRangeStatus = 'ready' | 'invalid';

function DateRangeFilter({ from, to, onApply, onStatusChange }: {
  /** Committed ISO values from the parent — read only to seed this component's own text
   * state on mount; never written back to directly (only via onApply). */
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onStatusChange: (status: DateRangeStatus) => void;
}) {
  const [fromParts, setFromParts] = useState<DateParts>(() => isoToParts(from));
  const [toParts, setToParts] = useState<DateParts>(() => isoToParts(to));
  const [dateError, setDateError] = useState<string | null>(null);
  const [fromInvalid, setFromInvalid] = useState(false);
  const [toInvalid, setToInvalid] = useState(false);

  // Focus targets for auto-advance (day → month → year) and backspace-to-previous-segment.
  const fromGroupRef = useRef<HTMLDivElement>(null);
  const toGroupRef = useRef<HTMLDivElement>(null);
  const fromMonthRef = useRef<HTMLInputElement>(null);
  const fromYearRef = useRef<HTMLInputElement>(null);
  const fromDayRef = useRef<HTMLInputElement>(null);
  const toMonthRef = useRef<HTMLInputElement>(null);
  const toYearRef = useRef<HTMLInputElement>(null);
  const toDayRef = useRef<HTMLInputElement>(null);

  // The single validation/commit path for BOTH manual typing (via the group blur handlers below)
  // and the calendar picker (via handlePickerChange). Order: complete? → calendar validity →
  // both-sides-present → To not in the future → From <= To. Only calls onApply once every step
  // passes (or both sides are entirely empty); a merely *incomplete* pair (still being typed)
  // reports 'invalid' silently — no error text — and never falls back to stale data.
  function evaluate(f: DateParts, t: DateParts) {
    const fEmpty = partsAreEmpty(f);
    const tEmpty = partsAreEmpty(t);

    if (fEmpty && tEmpty) {
      setFromInvalid(false);
      setToInvalid(false);
      setDateError(null);
      onStatusChange('ready');
      onApply('', '');
      return;
    }

    const fComplete = partsAreComplete(f);
    const tComplete = partsAreComplete(t);

    // Anything short of every segment being fully typed is mid-edit, not a bad date — stay
    // quiet and simply withhold filtering until it's complete.
    if ((!fEmpty && !fComplete) || (!tEmpty && !tComplete)) {
      setFromInvalid(false);
      setToInvalid(false);
      setDateError(null);
      onStatusChange('invalid');
      return;
    }

    // Both sides are now either empty or fully typed. One side fully empty while the other is
    // complete is an incomplete pair — same silent withholding as above.
    if (fEmpty || tEmpty) {
      setDateError(null);
      onStatusChange('invalid');
      return;
    }

    const fromIso = parseStrictDDMMYYYY(partsToDDMMYYYY(f));
    const toIso = parseStrictDDMMYYYY(partsToDDMMYYYY(t));
    const fromBad = fromIso === null;
    const toBad = toIso === null;
    setFromInvalid(fromBad);
    setToInvalid(toBad);

    if (fromBad || toBad) {
      setDateError('Invalid date. Please enter a valid date in DD-MM-YYYY format.');
      onStatusChange('invalid');
      return;
    }

    if (toIso! > todayIsoLocal()) {
      setToInvalid(true);
      setDateError('To date cannot be a future date.');
      onStatusChange('invalid');
      return;
    }

    if (!isRangeValid(fromIso!, toIso!)) {
      setDateError('From date cannot be later than To date.');
      onStatusChange('invalid');
      return;
    }

    setDateError(null);
    onStatusChange('ready');
    onApply(fromIso!, toIso!);
  }

  // Zero-pads a single leftover digit (user typed "5" then tabbed/clicked away) so "5" and "05"
  // behave identically — applied only once the user has actually left the whole DD-MM-YYYY group,
  // never mid-edit.
  function padParts(p: DateParts): DateParts {
    return {
      day: p.day.length === 1 ? p.day.padStart(2, '0') : p.day,
      month: p.month.length === 1 ? p.month.padStart(2, '0') : p.month,
      year: p.year,
    };
  }

  // Fires only when focus has left the entire From (or To) group of three segment inputs —
  // not on every inter-segment blur — so validation runs once per completed edit, exactly when
  // "a complete date has been entered", rather than while the user is still mid-component.
  function handleFromGroupBlur(e: React.FocusEvent) {
    if (fromGroupRef.current?.contains(e.relatedTarget as Node | null)) return;
    const padded = padParts(fromParts);
    if (padded.day !== fromParts.day || padded.month !== fromParts.month) setFromParts(padded);
    evaluate(padded, toParts);
  }

  function handleToGroupBlur(e: React.FocusEvent) {
    if (toGroupRef.current?.contains(e.relatedTarget as Node | null)) return;
    const padded = padParts(toParts);
    if (padded.day !== toParts.day || padded.month !== toParts.month) setToParts(padded);
    evaluate(fromParts, padded);
  }

  // The calendar picker's native <input type="date"> value is browser-guaranteed to be either
  // empty or a genuine valid date, but it still funnels through the same `evaluate` so a picker
  // pick and manual entry are validated/committed identically — including the From <= To and
  // future-To checks. Unlike manual entry, a picker pick is always already complete, so it
  // evaluates immediately rather than waiting for the group to lose focus.
  function handlePickerChange(field: 'from' | 'to', e: React.ChangeEvent<HTMLInputElement>) {
    const parts = isoToParts(e.target.value);
    if (field === 'from') {
      setFromParts(parts);
      evaluate(parts, toParts);
    } else {
      setToParts(parts);
      evaluate(fromParts, parts);
    }
  }

  function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur();
  }

  /** Backspace on an already-empty segment moves focus (never digits) to the previous segment,
   * landing the caret at its end so backspacing can continue — a pure focus move, so it can
   * never pull digits across component boundaries. */
  function backspaceToPrev(e: React.KeyboardEvent<HTMLInputElement>, current: string, prevRef: React.RefObject<HTMLInputElement | null>) {
    if (e.key !== 'Backspace' || current !== '') return;
    const prev = prevRef.current;
    if (!prev) return;
    e.preventDefault();
    prev.focus();
    prev.setSelectionRange(prev.value.length, prev.value.length);
  }

  function focusAndSelect(input: HTMLInputElement | null) {
    input?.focus();
    input?.select();
  }

  const segStyle: React.CSSProperties = {
    border: 'none', background: 'transparent', outline: 'none', color: 'inherit',
    font: 'inherit', textAlign: 'center', padding: 0, boxSizing: 'border-box', flexShrink: 0,
  };
  // Fixed px, not `ch` — `ch` sizes off the current font's digit ('0') advance width, but the
  // placeholders here are letters ("DD"/"MM"/"YYYY"), which render wider than digits in Inter.
  // A `2ch`/`4ch` box was clipping its own placeholder text even though the segment held a
  // "complete" value. These widths are sized to the letter placeholders, the wider case, so the
  // same box comfortably fits either the placeholder or two/four typed digits.
  const SEG_WIDTH_DD_MM = 22;
  const SEG_WIDTH_YYYY = 38;
  const sepStyle: React.CSSProperties = { color: 'var(--txt-dim)', flexShrink: 0 };
  // "From" and "To" are different lengths, so a plain inline label left the icon — which was
  // pinned to a fixed offset from the *container's* right edge — sitting behind a variable
  // amount of slack: identical container width and identical icon offset still produced a
  // visibly bigger gap after "To" than after "From", since less label text meant less content
  // pushing the segments (and the fixed-position icon) toward the right. A fixed-width,
  // right-aligned label box makes both labels end at the same x position regardless of text
  // length, so "DD" always starts from the same spot in both fields.
  const LABEL_WIDTH = 30;
  const labelStyle: React.CSSProperties = {
    color: 'var(--txt-dim)', fontSize: 12, width: LABEL_WIDTH, textAlign: 'right', flexShrink: 0,
  };

  return (
    <>
      <div
        ref={fromGroupRef}
        onBlur={handleFromGroupBlur}
        style={{ ...inputStyle, display: 'inline-flex', alignItems: 'center', gap: 4, width: 196, paddingRight: 10, fontWeight: 400 }}
      >
        <span style={labelStyle}>From</span>
        <input
          ref={fromDayRef}
          type="text" inputMode="numeric" placeholder="DD" maxLength={2}
          value={fromParts.day}
          onChange={e => {
            const day = digitsOnly(e.target.value, 2);
            setFromParts(p => ({ ...p, day }));
            if (day.length === 2) focusAndSelect(fromMonthRef.current);
          }}
          onKeyDown={handleEnter}
          aria-label="From day" aria-invalid={fromInvalid}
          style={{ ...segStyle, width: SEG_WIDTH_DD_MM }}
        />
        <span style={sepStyle}>-</span>
        <input
          ref={fromMonthRef}
          type="text" inputMode="numeric" placeholder="MM" maxLength={2}
          value={fromParts.month}
          onChange={e => {
            const month = digitsOnly(e.target.value, 2);
            setFromParts(p => ({ ...p, month }));
            if (month.length === 2) focusAndSelect(fromYearRef.current);
          }}
          onKeyDown={e => { backspaceToPrev(e, fromParts.month, fromDayRef); handleEnter(e); }}
          aria-label="From month" aria-invalid={fromInvalid}
          style={{ ...segStyle, width: SEG_WIDTH_DD_MM }}
        />
        <span style={sepStyle}>-</span>
        <input
          ref={fromYearRef}
          type="text" inputMode="numeric" placeholder="YYYY" maxLength={4}
          value={fromParts.year}
          onChange={e => setFromParts(p => ({ ...p, year: digitsOnly(e.target.value, 4) }))}
          onKeyDown={e => { backspaceToPrev(e, fromParts.year, fromMonthRef); handleEnter(e); }}
          aria-label="From year" aria-invalid={fromInvalid}
          style={{ ...segStyle, width: SEG_WIDTH_YYYY }}
        />
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
          <CalendarIcon size={13} aria-hidden="true" style={{ color: 'var(--txt-dim)', pointerEvents: 'none' }} />
          <input
            type="date" min={MIN_ISO_DATE} max={MAX_ISO_DATE}
            value={from}
            onChange={e => handlePickerChange('from', e)}
            tabIndex={-1}
            aria-label="Pick From date from calendar"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
          />
        </div>
      </div>
      <span style={{ color: 'var(--txt-dim)', fontSize: 12 }}>→</span>
      <div
        ref={toGroupRef}
        onBlur={handleToGroupBlur}
        style={{ ...inputStyle, display: 'inline-flex', alignItems: 'center', gap: 4, width: 196, paddingRight: 10, fontWeight: 400 }}
      >
        <span style={labelStyle}>To</span>
        <input
          ref={toDayRef}
          type="text" inputMode="numeric" placeholder="DD" maxLength={2}
          value={toParts.day}
          onChange={e => {
            const day = digitsOnly(e.target.value, 2);
            setToParts(p => ({ ...p, day }));
            if (day.length === 2) focusAndSelect(toMonthRef.current);
          }}
          onKeyDown={handleEnter}
          aria-label="To day" aria-invalid={toInvalid}
          style={{ ...segStyle, width: SEG_WIDTH_DD_MM }}
        />
        <span style={sepStyle}>-</span>
        <input
          ref={toMonthRef}
          type="text" inputMode="numeric" placeholder="MM" maxLength={2}
          value={toParts.month}
          onChange={e => {
            const month = digitsOnly(e.target.value, 2);
            setToParts(p => ({ ...p, month }));
            if (month.length === 2) focusAndSelect(toYearRef.current);
          }}
          onKeyDown={e => { backspaceToPrev(e, toParts.month, toDayRef); handleEnter(e); }}
          aria-label="To month" aria-invalid={toInvalid}
          style={{ ...segStyle, width: SEG_WIDTH_DD_MM }}
        />
        <span style={sepStyle}>-</span>
        <input
          ref={toYearRef}
          type="text" inputMode="numeric" placeholder="YYYY" maxLength={4}
          value={toParts.year}
          onChange={e => setToParts(p => ({ ...p, year: digitsOnly(e.target.value, 4) }))}
          onKeyDown={e => { backspaceToPrev(e, toParts.year, toMonthRef); handleEnter(e); }}
          aria-label="To year" aria-invalid={toInvalid}
          style={{ ...segStyle, width: SEG_WIDTH_YYYY }}
        />
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
          <CalendarIcon size={13} aria-hidden="true" style={{ color: 'var(--txt-dim)', pointerEvents: 'none' }} />
          <input
            type="date" min={MIN_ISO_DATE} max={todayIsoLocal()}
            value={to}
            onChange={e => handlePickerChange('to', e)}
            tabIndex={-1}
            aria-label="Pick To date from calendar"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
          />
        </div>
      </div>
      {dateError && (
        <span role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--risk)' }}>
          <AlertTriangle size={12} aria-hidden="true" /> {dateError}
        </span>
      )}
    </>
  );
}

// ── filter bar ─────────────────────────────────────────────────────────────────

interface Filters {
  from: string;
  to: string;
  projectId: string;
  employeeId: string;
  teamManagerId: string;
  client: string;
}

function FilterBar({ filters, onChange, onDateStatusChange }: {
  filters: Filters; onChange: (next: Filters) => void; onDateStatusChange: (status: DateRangeStatus) => void;
}) {
  const { data: options } = useProjectDashboardFilters();
  // Bumped on "Clear" to remount DateRangeFilter, resetting its internal text/error state to
  // match the now-cleared from/to props — simpler than lifting that state up into this bar.
  const [clearGen, setClearGen] = useState(0);

  return (
    <Card style={{ padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select
          aria-label="Filter by project"
          style={{ ...inputStyle, width: 190 }}
          value={filters.projectId}
          onChange={e => onChange({ ...filters, projectId: e.target.value })}
        >
          <option value="">All projects</option>
          {options?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select
          aria-label="Filter by employee"
          style={{ ...inputStyle, width: 190 }}
          value={filters.employeeId}
          onChange={e => onChange({ ...filters, employeeId: e.target.value })}
        >
          <option value="">All employees</option>
          {options?.employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>

        <select
          aria-label="Filter by team"
          style={{ ...inputStyle, width: 170 }}
          value={filters.teamManagerId}
          onChange={e => onChange({ ...filters, teamManagerId: e.target.value })}
        >
          <option value="">All teams</option>
          {options?.teams.map(t => <option key={t.managerId} value={t.managerId}>{t.managerName}'s Team</option>)}
        </select>

        <select
          aria-label="Filter by client"
          style={{ ...inputStyle, width: 170 }}
          value={filters.client}
          onChange={e => onChange({ ...filters, client: e.target.value })}
        >
          <option value="">All clients</option>
          {options?.clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <DateRangeFilter
          key={clearGen}
          from={filters.from}
          to={filters.to}
          onApply={(from, to) => onChange({ ...filters, from, to })}
          onStatusChange={onDateStatusChange}
        />

        {(filters.projectId || filters.employeeId || filters.teamManagerId || filters.client) && (
          <button
            type="button"
            onClick={() => {
              onChange({ ...filters, projectId: '', employeeId: '', teamManagerId: '', client: '', from: '', to: '' });
              onDateStatusChange('ready');
              setClearGen(g => g + 1);
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '8px 10px', background: 'transparent', border: '1px solid var(--line2)',
              borderRadius: 6, color: 'var(--txt-mut)', fontSize: 12, cursor: 'pointer',
            }}
          >
            <X size={12} aria-hidden="true" /> Clear
          </button>
        )}
      </div>
    </Card>
  );
}

// ── project-wise utilization table ──────────────────────────────────────────────

type ProjectSortKey = 'projectName' | 'plannedHours' | 'actualHours' | 'variance' | 'utilizationPct';

function ProjectUtilizationTable({ rows }: { rows: ProjectUtilizationRowDto[] }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sort, setSort] = useState<{ key: ProjectSortKey; dir: SortDir }>({ key: 'projectName', dir: 'asc' });

  function toggle(key: ProjectSortKey) {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const base = term === '' ? rows : rows.filter(r => r.projectName.toLowerCase().includes(term));
    const copy = [...base];
    copy.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, debouncedSearch, sort]);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeaderWithSearch
        title="Project-wise Utilization" subtitle="Planned vs. actual hours logged, per project"
        search={search} onSearchChange={setSearch} placeholder="Search project..."
      />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No data for the selected filters.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortableTh label="Project" active={sort.key === 'projectName'} dir={sort.dir} onToggle={() => toggle('projectName')} />
                <SortableTh label="Planned" active={sort.key === 'plannedHours'} dir={sort.dir} onToggle={() => toggle('plannedHours')} />
                <SortableTh label="Actual" active={sort.key === 'actualHours'} dir={sort.dir} onToggle={() => toggle('actualHours')} />
                <SortableTh label="Variance" active={sort.key === 'variance'} dir={sort.dir} onToggle={() => toggle('variance')} />
                <SortableTh label="Utilization" active={sort.key === 'utilizationPct'} dir={sort.dir} onToggle={() => toggle('utilizationPct')} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.projectId}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.projectName}</td>
                  <td style={tdStyle}>{fmtHours(r.plannedHours)}</td>
                  <td style={tdStyle}>{fmtHours(r.actualHours)}</td>
                  <td style={{ ...tdStyle, color: r.variance < 0 ? 'var(--risk)' : 'var(--ok)' }}>
                    {r.variance >= 0 ? '+' : ''}{r.variance.toFixed(1)}h
                  </td>
                  <td style={{ ...tdStyle, color: utilColor(r.utilizationPct), fontWeight: 600 }}>{fmtPct(r.utilizationPct)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No project matches your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── resource utilization table ──────────────────────────────────────────────────

type ResourceSortKey = 'employeeName' | 'projectName' | 'productiveHours' | 'utilizationPct';

function ResourceUtilizationTable({ rows }: { rows: ResourceUtilizationRowDto[] }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sort, setSort] = useState<{ key: ResourceSortKey; dir: SortDir }>({ key: 'employeeName', dir: 'asc' });

  function toggle(key: ResourceSortKey) {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const base = term === '' ? rows : rows.filter(r => r.employeeName.toLowerCase().includes(term));
    const copy = [...base];
    copy.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, debouncedSearch, sort]);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeaderWithSearch
        title="Resource Utilization" subtitle="Per-employee allocation vs. logged hours"
        search={search} onSearchChange={setSearch}
      />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No data for the selected filters.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortableTh label="Employee" active={sort.key === 'employeeName'} dir={sort.dir} onToggle={() => toggle('employeeName')} />
                <SortableTh label="Project" active={sort.key === 'projectName'} dir={sort.dir} onToggle={() => toggle('projectName')} />
                <SortableTh label="Productive Hrs" active={sort.key === 'productiveHours'} dir={sort.dir} onToggle={() => toggle('productiveHours')} />
                <th style={thStyle}>Available Hrs</th>
                <SortableTh label="Utilization" active={sort.key === 'utilizationPct'} dir={sort.dir} onToggle={() => toggle('utilizationPct')} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.employeeId}-${r.projectName}-${i}`}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.employeeName}</td>
                  <td style={tdStyle}>{r.projectName}</td>
                  <td style={tdStyle}>{fmtHours(r.productiveHours)}</td>
                  <td style={tdStyle}>{fmtHours(r.availableHours)}</td>
                  <td style={{ ...tdStyle, color: utilColor(r.utilizationPct), fontWeight: 600 }}>{fmtPct(r.utilizationPct)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No employee matches your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── missing EOD table ────────────────────────────────────────────────────────────

function MissingEodTable({ rows }: { rows: MissingEodRowDto[] }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return term === '' ? rows : rows.filter(r => r.employeeName.toLowerCase().includes(term));
  }, [rows, debouncedSearch]);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeaderWithSearch
        title="Missing EOD Submission Breakdown" subtitle="Working days in range with no submitted/approved EOD"
        search={search} onSearchChange={setSearch}
      />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No missing submissions in this range.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Team</th>
                <th style={thStyle}>Last Missing Date</th>
                <th style={thStyle}>Days Missing</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cfg = MISSING_STATUS_CFG[r.status];
                return (
                  <tr key={r.employeeId}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{r.employeeName}</td>
                    <td style={tdStyle}>{r.projectName}</td>
                    <td style={tdStyle}>{r.teamName}</td>
                    <td style={tdStyle}>{r.date}</td>
                    <td style={tdStyle}>{r.daysMissing}</td>
                    <td style={tdStyle}><StatusPill color={cfg.color} label={cfg.label} /></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No employee matches your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function ProjectDashboard() {
  // Recharts measures axis width in JS, so this one can't be done in CSS.
  const isPhone = useIsPhone();
  // From/To default to the 1st of the current month through today, computed fresh off the
  // real local date (never a fixed month/year) — and are never persisted to storage, so this
  // plain useState re-derives that same default on every fresh mount, including the one that
  // follows a logout/login (the protected route tree unmounts entirely on logout). Any custom
  // dates a user picks live only in this instance's state and vanish with it — the next login,
  // by the same user or a different one, always starts from this computed default again.
  const [filters, setFilters] = useState<Filters>({
    from: firstDayOfMonthIsoLocal(), to: todayIsoLocal(),
    projectId: '', employeeId: '', teamManagerId: '', client: '',
  });
  // Gates whether the dashboard shows data at all — see DateRangeFilter above. Starts 'ready'
  // since the initial From+To pair is already a valid, complete range.
  const [dateFilterStatus, setDateFilterStatus] = useState<DateRangeStatus>('ready');

  const { data, isPending, isError, refetch } = useProjectDashboardSummary({
    from: filters.from || undefined,
    to: filters.to || undefined,
    projectId: filters.projectId ? Number(filters.projectId) : undefined,
    employeeId: filters.employeeId ? Number(filters.employeeId) : undefined,
    teamManagerId: filters.teamManagerId ? Number(filters.teamManagerId) : undefined,
    client: filters.client || undefined,
  }, dateFilterStatus !== 'invalid');

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <Skel h={26} w={220} />
          <div style={{ marginTop: 8 }}><Skel h={14} w={300} /></div>
        </div>
        <Card style={{ padding: 16, marginBottom: 20 }}><Skel h={38} /></Card>
        <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[0, 1, 2, 3, 4].map(i => <Card key={i} style={{ padding: 18 }}><Skel h={28} w={60} /><div style={{ marginTop: 8 }}><Skel h={12} w={80} /></div></Card>)}
        </div>
        <Card style={{ padding: 20 }}><Skel h={240} /></Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Project Dashboard</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load dashboard.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  const { cards, projectUtilization, resourceUtilization, billableSplit, plannedVsActual, missingEod, taskCategoryBreakdown } = data;

  const billableChartData = [
    { name: 'Billable', hours: billableSplit.billableHours, pct: billableSplit.billablePct },
    { name: 'Non-Billable', hours: billableSplit.nonBillableHours, pct: billableSplit.nonBillablePct },
  ];
  const BILLABLE_COLORS = ['var(--ok)', 'var(--info)'];

  const plannedActualChartData = projectUtilization.map(p => ({
    name: p.projectName, Planned: p.plannedHours, Actual: p.actualHours,
  }));

  const categoryChartData = taskCategoryBreakdown.map(c => ({ name: c.category, hours: c.hours }));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Project Dashboard
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Resource utilization, project health and EOD compliance across your portfolio.
        </p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} onDateStatusChange={setDateFilterStatus} />

      {dateFilterStatus === 'invalid' ? (
        <Card style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            Enter valid From and To dates to view the dashboard for that range.
          </div>
        </Card>
      ) : (
        <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard icon={<FolderKanban size={17} aria-hidden="true" />} label="Total Projects" value={cards.totalAssignedProjects} />
        <KpiCard icon={<CheckCircle2 size={17} aria-hidden="true" />} label="Active" value={cards.activeProjects} accent="var(--ok)" />
        <KpiCard icon={<PauseCircle size={17} aria-hidden="true" />} label="On Hold" value={cards.onHoldProjects} accent="var(--warn)" />
        <KpiCard icon={<Archive size={17} aria-hidden="true" />} label="Completed" value={cards.completedProjects} accent="var(--info)" />
        <KpiCard icon={<AlertTriangle size={17} aria-hidden="true" />} label="Missing EOD" value={cards.missingEodCount} accent={cards.missingEodCount > 0 ? 'var(--risk)' : 'var(--txt)'} />
        <KpiCard icon={<Gauge size={17} aria-hidden="true" />} label="Overall Utilization" value={fmtPct(cards.overallUtilizationPct)} accent={utilColor(cards.overallUtilizationPct)} />
        <KpiCard icon={<Briefcase size={17} aria-hidden="true" />} label="Billable Utilization" value={fmtPct(cards.billableUtilizationPct)} accent="var(--ok)" />
        <KpiCard icon={<Ban size={17} aria-hidden="true" />} label="Non-Billable Utilization" value={fmtPct(cards.nonBillableUtilizationPct)} accent="var(--info)" />
        <KpiCard icon={<Target size={17} aria-hidden="true" />} label="Planned Utilization" value={fmtPct(cards.plannedUtilizationPct)} />
        <KpiCard icon={<TrendingUp size={17} aria-hidden="true" />} label="Actual Utilization" value={fmtPct(cards.actualUtilizationPct)} accent={utilColor(cards.actualUtilizationPct)} />
      </div>

      {/* Charts row */}
      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <SectionHeader title="Billable vs Non-Billable" subtitle="Share of approved hours logged in range" />
          <div style={{ padding: '20px 16px', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={billableChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} unit="h" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--txt-mut)' }} width={90} />
                <Tooltip
                  cursor={false}
                  contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  formatter={((value: number, _name: string, item: { payload: { pct: number } }) =>
                    [`${value.toFixed(1)}h (${item.payload.pct.toFixed(1)}%)`, 'Hours']) as never}
                />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {billableChartData.map((entry, i) => <Cell key={entry.name} fill={BILLABLE_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <SectionHeader title="Planned vs Actual Utilization" subtitle={`Variance: ${plannedVsActual.variance >= 0 ? '+' : ''}${plannedVsActual.variance.toFixed(1)}h (${plannedVsActual.variancePct.toFixed(1)}%)`} />
          <div style={{ padding: '20px 16px', height: 200 }}>
            {plannedActualChartData.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-dim)', fontSize: 13 }}>No data for the selected filters.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plannedActualChartData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} unit="h" />
                  <Tooltip cursor={false} contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Planned" fill="var(--info)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="Actual" fill="var(--ok)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <SectionHeader title="Utilization by Task Category" subtitle="Approved hours grouped by task category" />
        <div style={{ padding: '20px 16px', height: Math.max(200, categoryChartData.length * 34) }}>
          {categoryChartData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-dim)', fontSize: 13 }}>No data for the selected filters.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} unit="h" />
                {/* 140px of category labels leaves only ~160px for the bars on a
                    phone, so give the labels less and the data more down there. */}
                <YAxis type="category" dataKey="name" tick={{ fontSize: isPhone ? 10 : 12, fill: 'var(--txt-mut)' }} width={isPhone ? 84 : 140} />
                <Tooltip cursor={false} contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} formatter={((v: number) => [`${v.toFixed(1)}h`, 'Hours']) as never} />
                <Bar dataKey="hours" fill="var(--info)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 20 }}>
        <ProjectUtilizationTable rows={projectUtilization} />
        <ResourceUtilizationTable rows={resourceUtilization} />
        <MissingEodTable rows={missingEod} />
      </div>
        </>
      )}
    </div>
  );
}
