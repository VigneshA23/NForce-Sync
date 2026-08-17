import { useMemo, useState } from 'react';
import {
  FolderKanban, CheckCircle2, PauseCircle, Archive, Gauge, Briefcase, Ban,
  Target, TrendingUp, AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { KpiCard } from '../../components/KpiCard';
import { todayISO } from '../../lib/date';
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
// Self-contained DD-MM-YYYY manual entry + calendar picker for the dashboard's From/To
// filters, mirroring the pattern built for Employee "My EOD History" (EodHistory.tsx):
// character-level input masking (never leaves invalid text sitting in the field), explicit
// calendar/leap-year arithmetic (never `new Date()` parsing/normalization), a future-date
// check for To, and a From <= To check — all funnelled through one validation path shared by
// both manual typing and the calendar picker. Kept local to this page rather than folded into
// the shared `components/DatePicker.tsx`, since that component is also used by Submit EOD,
// Admin User Management, and two other PM report pages that this change must not touch.

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

/** `YYYY-MM-DD` → `DD-MM-YYYY`, for mirroring a calendar-picker selection into the text field. */
function isoToDDMMYYYY(iso: string): string {
  const [y, mo, d] = iso.split('-');
  return `${d}-${mo}-${y}`;
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

/** Restricts raw keystrokes to the DD-MM-YYYY structure itself: strips every non-digit
 * character, caps at 8 digits (2+2+4), and auto-inserts the `-` separators as digits
 * accumulate. Always a syntactically-valid prefix of DD-MM-YYYY — completeness and calendar
 * validity are checked separately, on blur/Enter, by `parseStrictDDMMYYYY`. */
function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
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
  const [fromText, setFromText] = useState(() => (from ? isoToDDMMYYYY(from) : ''));
  const [toText, setToText] = useState(() => (to ? isoToDDMMYYYY(to) : ''));
  const [dateError, setDateError] = useState<string | null>(null);
  const [fromInvalid, setFromInvalid] = useState(false);
  const [toInvalid, setToInvalid] = useState(false);

  // The single validation/commit path for BOTH manual typing (via onBlur/Enter) and the
  // calendar picker (via handlePickerChange below). Order: format/day/month/year/calendar
  // validity → both-sides-present → To not in the future → From <= To. Only calls onApply
  // once every step passes (or both fields are empty); any failure reports 'invalid' and
  // leaves the parent's committed from/to exactly as they were — never a fallback to
  // whatever was last valid.
  function evaluate(nextFromText: string, nextToText: string) {
    const fromTrimmed = nextFromText.trim();
    const toTrimmed = nextToText.trim();
    const fromEmpty = fromTrimmed === '';
    const toEmpty = toTrimmed === '';

    if (fromEmpty && toEmpty) {
      setFromInvalid(false);
      setToInvalid(false);
      setDateError(null);
      onStatusChange('ready');
      onApply('', '');
      return;
    }

    const fromIso = fromEmpty ? null : parseStrictDDMMYYYY(fromTrimmed);
    const toIso = toEmpty ? null : parseStrictDDMMYYYY(toTrimmed);
    const fromBad = !fromEmpty && fromIso === null;
    const toBad = !toEmpty && toIso === null;
    setFromInvalid(fromBad);
    setToInvalid(toBad);

    if (fromBad || toBad) {
      setDateError('Invalid date. Please enter a valid date in DD-MM-YYYY format.');
      onStatusChange('invalid');
      return;
    }

    // Both individually well-formed at this point — an incomplete pair (only one side
    // filled in) must not filter, and must not fall back to showing unfiltered/stale data.
    if (fromEmpty || toEmpty) {
      setDateError(null);
      onStatusChange('invalid');
      return;
    }

    if (toIso! > todayIsoLocal()) {
      setToInvalid(true);
      setDateError('To date cannot be a future date.');
      onStatusChange('invalid');
      return;
    }

    if (!isRangeValid(fromIso ?? '', toIso ?? '')) {
      setDateError('From date cannot be later than To date.');
      onStatusChange('invalid');
      return;
    }

    setDateError(null);
    onStatusChange('ready');
    onApply(fromIso ?? '', toIso ?? '');
  }

  // The calendar picker's native <input type="date"> value is browser-guaranteed to be
  // either empty or a genuine valid date, but it still funnels through the same `evaluate`
  // so a picker pick and a manual entry are validated/committed identically — including
  // still being subject to the From <= To and future-To checks.
  function handlePickerChange(field: 'from' | 'to', e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value;
    const ddmmyyyy = iso ? isoToDDMMYYYY(iso) : '';
    if (field === 'from') {
      setFromText(ddmmyyyy);
      evaluate(ddmmyyyy, toText);
    } else {
      setToText(ddmmyyyy);
      evaluate(fromText, ddmmyyyy);
    }
  }

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <input
          type="text" inputMode="numeric" placeholder="From (DD-MM-YYYY)" maxLength={10}
          value={fromText}
          onChange={e => setFromText(maskDateInput(e.target.value))}
          onBlur={() => evaluate(fromText, toText)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label="From date"
          aria-invalid={fromInvalid}
          style={{ ...inputStyle, width: 150, paddingRight: 26, fontWeight: 400 }}
        />
        <div style={{
          position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--txt-dim)', display: 'flex', pointerEvents: 'none',
        }}>
          <CalendarIcon size={13} aria-hidden="true" />
        </div>
        <input
          type="date" min={MIN_ISO_DATE} max={MAX_ISO_DATE}
          value={from}
          onChange={e => handlePickerChange('from', e)}
          tabIndex={-1}
          aria-label="Pick From date from calendar"
          style={{ position: 'absolute', right: 0, top: 0, width: 24, height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
        />
      </div>
      <span style={{ color: 'var(--txt-dim)', fontSize: 12 }}>→</span>
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <input
          type="text" inputMode="numeric" placeholder="To (DD-MM-YYYY)" maxLength={10}
          value={toText}
          onChange={e => setToText(maskDateInput(e.target.value))}
          onBlur={() => evaluate(fromText, toText)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label="To date"
          aria-invalid={toInvalid}
          style={{ ...inputStyle, width: 150, paddingRight: 26, fontWeight: 400 }}
        />
        <div style={{
          position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--txt-dim)', display: 'flex', pointerEvents: 'none',
        }}>
          <CalendarIcon size={13} aria-hidden="true" />
        </div>
        <input
          type="date" min={MIN_ISO_DATE} max={todayIsoLocal()}
          value={to}
          onChange={e => handlePickerChange('to', e)}
          tabIndex={-1}
          aria-label="Pick To date from calendar"
          style={{ position: 'absolute', right: 0, top: 0, width: 24, height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
        />
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

function firstDayOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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
  const [sort, setSort] = useState<{ key: ProjectSortKey; dir: SortDir }>({ key: 'projectName', dir: 'asc' });

  function toggle(key: ProjectSortKey) {
    setSort(prev => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeader title="Project-wise Utilization" subtitle="Planned vs. actual hours logged, per project" />
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
              {sorted.map(r => (
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
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Resource Utilization</div>
          <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>Per-employee allocation vs. logged hours</div>
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employee"
          aria-label="Search employee"
          style={{ ...inputStyle, width: 200, fontWeight: 400 }}
        />
      </div>
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
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeader title="Missing EOD Submission Breakdown" subtitle="Working days in range with no submitted/approved EOD" />
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
              {rows.map(r => {
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
  const [filters, setFilters] = useState<Filters>({
    from: firstDayOfMonthISO(),
    to: todayISO(),
    projectId: '', employeeId: '', teamManagerId: '', client: '',
  });
  // Gates whether the dashboard shows data at all — see DateRangeFilter above. Starts
  // 'ready' since the initial from/to are already a valid, backend-default-matching range.
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
                  <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} />
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
                <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} formatter={((v: number) => [`${v.toFixed(1)}h`, 'Hours']) as never} />
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
