import { useMemo, useState } from 'react';
import {
  Target, TrendingUp, ArrowLeftRight, Users, RefreshCw, AlertTriangle,
  ArrowUp, ArrowDown, ArrowUpDown, X, Calendar as CalendarIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { KpiCard } from '../../components/KpiCard';
import { todayISO } from '../../lib/date';
import { useProjectDashboardFilters } from '../../api/projectDashboard';
import {
  usePlannedVsActualSummary,
  type PlannedVsActualProjectRowDto,
  type PlannedVsActualResourceRowDto,
  type PlanStatus,
} from '../../api/plannedVsActual';

// ── shared local styles (mirrors ProjectDashboard.tsx / ProjectsAllocation.tsx conventions) ──

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

function fmtSignedPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)} pp`;
}

function fmtSignedHours(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}h`;
}

function varianceColor(n: number): string {
  if (Math.abs(n) < 0.05) return 'var(--txt-mut)';
  return n > 0 ? 'var(--risk)' : 'var(--warn)';
}

const STATUS_CFG: Record<PlanStatus, { color: string; label: string }> = {
  ABOVE_PLAN: { color: 'var(--risk)', label: 'Above Plan' },
  ON_PLAN:    { color: 'var(--ok)',   label: 'On Plan' },
  BELOW_PLAN: { color: 'var(--warn)', label: 'Below Plan' },
};

function StatusPill({ status }: { status: PlanStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
      color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

/** Trailing-edge debounce — same local pattern as ProjectDashboard.tsx (no shared debounce util exists). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return debounced;
}

// ── date range filter ────────────────────────────────────────────────────────
// Self-contained DD-MM-YYYY manual entry + calendar picker, mirroring ProjectDashboard.tsx's
// DateRangeFilter exactly (character-level input masking, explicit calendar/leap-year arithmetic,
// future-date check for To, From <= To check). Kept local to this page for the same reason
// ProjectDashboard.tsx keeps its own copy local rather than centralized: several other pages
// already have their own copy and this change must not touch them.

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

function isoToDDMMYYYY(iso: string): string {
  const [y, mo, d] = iso.split('-');
  return `${d}-${mo}-${y}`;
}

function isRangeValid(from: string, to: string): boolean {
  if (from === '' || to === '') return true;
  return from <= to;
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

type DateRangeStatus = 'ready' | 'invalid';

function DateRangeFilter({ from, to, onApply, onStatusChange }: {
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
}

function firstDayOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function FilterBar({ filters, onChange, onDateStatusChange, employeeOptions, onRefresh, isFetching }: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onDateStatusChange: (status: DateRangeStatus) => void;
  employeeOptions: { id: number; fullName: string }[];
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const { data: options } = useProjectDashboardFilters();
  const [clearGen, setClearGen] = useState(0);

  return (
    <Card style={{ padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select
          aria-label="Filter by project"
          style={{ ...inputStyle, width: 190 }}
          value={filters.projectId}
          onChange={e => onChange({ ...filters, projectId: e.target.value, employeeId: '' })}
        >
          <option value="">All Projects</option>
          {options?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select
          aria-label="Filter by employee"
          style={{ ...inputStyle, width: 190 }}
          value={filters.employeeId}
          onChange={e => onChange({ ...filters, employeeId: e.target.value })}
        >
          <option value="">All Employees</option>
          {employeeOptions.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>

        <DateRangeFilter
          key={clearGen}
          from={filters.from}
          to={filters.to}
          onApply={(from, to) => onChange({ ...filters, from, to })}
          onStatusChange={onDateStatusChange}
        />

        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', background: 'var(--raised2)', border: '1px solid var(--line2)',
            borderRadius: 6, color: 'var(--txt)', fontSize: 12.5, cursor: isFetching ? 'default' : 'pointer',
            opacity: isFetching ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} aria-hidden="true" style={isFetching ? { animation: 'pm-pva-spin 0.8s linear infinite' } : undefined} />
          Refresh
        </button>

        {(filters.projectId || filters.employeeId) && (
          <button
            type="button"
            onClick={() => {
              onChange({ ...filters, projectId: '', employeeId: '', from: '', to: '' });
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
      <style>{`@keyframes pm-pva-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Card>
  );
}

// ── project-wise table ───────────────────────────────────────────────────────────

type ProjectSortKey = 'projectName' | 'plannedHours' | 'actualHours' | 'varianceHours' | 'variancePct';

function ProjectTable({ rows }: { rows: PlannedVsActualProjectRowDto[] }) {
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
      <SectionHeader title="Project-wise Planned vs Actual" subtitle="Planned hours from allocation windows · Actual = approved productive EOD hours" />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
          No planned allocation available for the selected period.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <SortableTh label="Project" active={sort.key === 'projectName'} dir={sort.dir} onToggle={() => toggle('projectName')} />
                <SortableTh label="Planned Hrs" active={sort.key === 'plannedHours'} dir={sort.dir} onToggle={() => toggle('plannedHours')} />
                <SortableTh label="Actual Hrs" active={sort.key === 'actualHours'} dir={sort.dir} onToggle={() => toggle('actualHours')} />
                <th style={thStyle}>Planned %</th>
                <th style={thStyle}>Actual %</th>
                <SortableTh label="Var. Hrs" active={sort.key === 'varianceHours'} dir={sort.dir} onToggle={() => toggle('varianceHours')} />
                <SortableTh label="Var. pp" active={sort.key === 'variancePct'} dir={sort.dir} onToggle={() => toggle('variancePct')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.projectId}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.projectName}</td>
                  <td style={tdStyle}>{fmtHours(r.plannedHours)}</td>
                  <td style={tdStyle}>{fmtHours(r.actualHours)}</td>
                  <td style={tdStyle}>{fmtPct(r.plannedUtilizationPct)}</td>
                  <td style={tdStyle}>{fmtPct(r.actualUtilizationPct)}</td>
                  <td style={{ ...tdStyle, color: varianceColor(r.varianceHours), fontWeight: 600 }}>{fmtSignedHours(r.varianceHours)}</td>
                  <td style={{ ...tdStyle, color: varianceColor(r.variancePct), fontWeight: 600 }}>{fmtSignedPct(r.variancePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── resource-wise table ──────────────────────────────────────────────────────────

type ResourceSortKey =
  | 'employeeName' | 'projectName' | 'plannedHours' | 'actualHours' | 'varianceHours' | 'variancePct';

function ResourceTable({ rows }: { rows: PlannedVsActualResourceRowDto[] }) {
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Resource / Project Breakdown</div>
          <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>Per employee, per project — planned vs. approved actual hours</div>
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
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
          No planned allocation or actual EOD hours available for the selected filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>S.No.</th>
                <SortableTh label="Employee" active={sort.key === 'employeeName'} dir={sort.dir} onToggle={() => toggle('employeeName')} />
                <SortableTh label="Project" active={sort.key === 'projectName'} dir={sort.dir} onToggle={() => toggle('projectName')} />
                <SortableTh label="Planned Hrs" active={sort.key === 'plannedHours'} dir={sort.dir} onToggle={() => toggle('plannedHours')} />
                <th style={thStyle}>Planned %</th>
                <SortableTh label="Actual Hrs" active={sort.key === 'actualHours'} dir={sort.dir} onToggle={() => toggle('actualHours')} />
                <th style={thStyle}>Actual %</th>
                <SortableTh label="Var. Hrs" active={sort.key === 'varianceHours'} dir={sort.dir} onToggle={() => toggle('varianceHours')} />
                <SortableTh label="Var. pp" active={sort.key === 'variancePct'} dir={sort.dir} onToggle={() => toggle('variancePct')} />
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.employeeId}-${r.projectId}`}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.employeeName}</td>
                  <td style={tdStyle}>{r.projectName}</td>
                  <td style={tdStyle}>{fmtHours(r.plannedHours)}</td>
                  <td style={tdStyle}>{fmtPct(r.plannedUtilizationPct)}</td>
                  <td style={tdStyle}>{fmtHours(r.actualHours)}</td>
                  <td style={tdStyle}>{fmtPct(r.actualUtilizationPct)}</td>
                  <td style={{ ...tdStyle, color: varianceColor(r.varianceHours), fontWeight: 600 }}>{fmtSignedHours(r.varianceHours)}</td>
                  <td style={{ ...tdStyle, color: varianceColor(r.variancePct), fontWeight: 600 }}>{fmtSignedPct(r.variancePct)}</td>
                  <td style={tdStyle}><StatusPill status={r.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No employee matches your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function PlannedVsActual() {
  const [filters, setFilters] = useState<Filters>({
    from: firstDayOfMonthISO(),
    to: todayISO(),
    projectId: '', employeeId: '',
  });
  const [dateFilterStatus, setDateFilterStatus] = useState<DateRangeStatus>('ready');

  const queryEnabled = dateFilterStatus !== 'invalid';
  const from = filters.from || undefined;
  const to = filters.to || undefined;
  const projectId = filters.projectId ? Number(filters.projectId) : undefined;
  const employeeId = filters.employeeId ? Number(filters.employeeId) : undefined;

  // Unfiltered-by-employee summary for the current project scope — narrows the Employee dropdown
  // to resources actually allocated to the selected project (or all PM resources when
  // "All Projects" is selected), per the PM data-scoping requirement.
  const { data: scopeData, refetch: refetchScope } = usePlannedVsActualSummary({ from, to, projectId }, queryEnabled);
  const employeeOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of scopeData?.resourceRows ?? []) seen.set(r.employeeId, r.employeeName);
    return [...seen.entries()]
      .map(([id, fullName]) => ({ id, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [scopeData]);

  const { data, isPending, isError, refetch, isFetching } =
    usePlannedVsActualSummary({ from, to, projectId, employeeId }, queryEnabled);

  const fromLabel = filters.from ? new Date(filters.from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const toLabel = filters.to ? new Date(filters.to + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Planned vs Actual Utilization
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Planned hours from resource allocation windows · Actual = approved productive EOD hours · {fromLabel} – {toLabel}
        </p>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        onDateStatusChange={setDateFilterStatus}
        employeeOptions={employeeOptions}
        onRefresh={() => { refetch(); refetchScope(); }}
        isFetching={isFetching}
      />

      {dateFilterStatus === 'invalid' ? (
        <Card style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            Enter valid From and To dates to view Planned vs Actual for that range.
          </div>
        </Card>
      ) : isPending ? (
        <PageSkeleton />
      ) : isError || !data ? (
        <Card style={{ padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 14 }}>Failed to load Planned vs Actual data.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      ) : (
        <PageContent data={data} />
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div>
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 20 }}>
        {[0, 1, 2, 3].map(i => <Card key={i} style={{ padding: 18 }}><Skel h={28} w={70} /><div style={{ marginTop: 8 }}><Skel h={12} w={90} /></div></Card>)}
      </div>
      <Card style={{ padding: 20, marginBottom: 20 }}><Skel h={220} /></Card>
      <Card style={{ padding: 20 }}><Skel h={240} /></Card>
    </div>
  );
}

function PageContent({ data }: { data: { cards: import('../../api/plannedVsActual').PlannedVsActualCardsDto; projectRows: PlannedVsActualProjectRowDto[]; resourceRows: PlannedVsActualResourceRowDto[] } }) {
  const { cards, projectRows, resourceRows } = data;

  const pctChartData = projectRows.map(p => ({
    name: p.projectName, Planned: p.plannedUtilizationPct, Actual: p.actualUtilizationPct,
    plannedHours: p.plannedHours, actualHours: p.actualHours,
    varianceHours: p.varianceHours, variancePct: p.variancePct,
  }));
  const hoursChartData = projectRows.map(p => ({
    name: p.projectName, Planned: p.plannedHours, Actual: p.actualHours,
  }));

  return (
    <>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard
          icon={<Target size={17} aria-hidden="true" />}
          label="Planned Utilization"
          value={fmtPct(cards.plannedUtilizationPct)}
          accent="var(--info)"
        />
        <KpiCard
          icon={<TrendingUp size={17} aria-hidden="true" />}
          label="Actual Utilization"
          value={fmtPct(cards.actualUtilizationPct)}
          accent="var(--ok)"
        />
        <KpiCard
          icon={<ArrowLeftRight size={17} aria-hidden="true" />}
          label="Variance"
          value={fmtSignedPct(cards.variancePct)}
          accent={varianceColor(cards.variancePct)}
        />
        <KpiCard
          icon={<Users size={17} aria-hidden="true" />}
          label="Resources / Projects"
          value={`${cards.resourceCount} / ${cards.projectCount}`}
          accent="var(--txt)"
        />
      </div>
      {/* Secondary hours line under the KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 20, marginTop: -10 }}>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', padding: '0 4px' }}>{fmtHours(cards.plannedHours)} planned</div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', padding: '0 4px' }}>{fmtHours(cards.actualHours)} actual</div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', padding: '0 4px' }}>{fmtSignedHours(cards.varianceHours)} variance</div>
        <div />
      </div>

      {/* Planned vs Actual % chart */}
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <SectionHeader title="Planned vs Actual Utilization" subtitle="Utilization % by project" />
        <div style={{ padding: '20px 16px', height: Math.max(220, projectRows.length * 10) }}>
          {pctChartData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-dim)', fontSize: 13 }}>
              No data for the selected filters.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pctChartData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} unit="%" />
                <Tooltip
                  cursor={false}
                  contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as typeof pctChartData[number];
                    return (
                      <div style={{ background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>{label}</div>
                        <div style={{ color: 'var(--info)' }}>Planned: {p.Planned.toFixed(1)}% ({p.plannedHours.toFixed(1)}h)</div>
                        <div style={{ color: 'var(--ok)' }}>Actual: {p.Actual.toFixed(1)}% ({p.actualHours.toFixed(1)}h)</div>
                        <div style={{ color: varianceColor(p.variancePct), marginTop: 4 }}>
                          Variance: {fmtSignedPct(p.variancePct)} ({fmtSignedHours(p.varianceHours)})
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Planned" fill="var(--info)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Actual" fill="var(--ok)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Planned vs Actual hours chart */}
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <SectionHeader title="Planned vs Actual Hours" subtitle="Hours logged vs. planned, by project" />
        <div style={{ padding: '20px 16px', height: Math.max(220, projectRows.length * 10) }}>
          {hoursChartData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--txt-dim)', fontSize: 13 }}>
              No data for the selected filters.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hoursChartData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--txt-dim)' }} unit="h" />
                <Tooltip
                  cursor={false}
                  contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  formatter={((value: number) => [`${value.toFixed(1)}h`, undefined]) as never}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Planned" fill="var(--info)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Actual" fill="var(--ok)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div style={{ marginBottom: 20 }}>
        <ProjectTable rows={projectRows} />
      </div>

      <ResourceTable rows={resourceRows} />
    </>
  );
}
