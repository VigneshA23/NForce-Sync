import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Download, RefreshCw, Search, Users } from 'lucide-react';
import { DatePicker } from '../../components/DatePicker';
import { FilterSelect } from '../../components/FilterSelect';
import { TimeAdjustmentBadge } from '../../components/TimeAdjustmentBadge';
import { formatDate, todayISO } from '../../lib/date';
import { useToast } from '../../lib/toast';
import { useProjectDashboardFilters } from '../../api/projectDashboard';
import { exportEodByEmployee, useEodByEmployeeReport, type EodByEmployeeRowDto, type ExportFormat } from '../../api/reports';

const EXPORT_FORMATS: { key: ExportFormat; label: string }[] = [
  { key: 'EXCEL', label: 'Excel' },
  { key: 'PDF', label: 'PDF' },
  { key: 'CSV', label: 'CSV' },
];

// ── helpers ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function hrs(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: 'Submitted', color: 'var(--ok)' },
  LATE: { label: 'Late', color: 'var(--warn)' },
  MISSING: { label: 'Missing', color: 'var(--risk)' },
};

// ── primitives ─────────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: 'var(--txt-dim)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
    }}>
      {cfg.label}
    </span>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8,
    color: 'var(--txt)', fontSize: 12.5, padding: '7px 10px', width: '100%', boxSizing: 'border-box',
  };
}

/**
 * Control styling for a filter <select>. A <select> has no placeholder colour of its own — its
 * first option renders in full-strength text, so "Select Project…" read like a chosen value next
 * to the DatePicker's genuinely greyed "Select date". Grey the control while it is still unset.
 */
function selectStyle(value: string): React.CSSProperties {
  return { ...inputStyle(), color: value === '' ? 'var(--txt-dim)' : 'var(--txt)' };
}

/** Real options stay full-strength even while the control itself is greyed. */
const OPTION_STYLE: React.CSSProperties = { color: 'var(--txt)' };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

// ── filter bar ─────────────────────────────────────────────────────────────────

// Each dropdown has three resting states, which is why the ids are held as strings rather than
// numbers: '' is the untouched placeholder, ALL is an explicit "don't restrict", and anything
// else is a real selection. '' and ALL filter identically — the distinction exists so the control
// can show "Select Project…" before you have chosen, and "All projects" after you deliberately did.
const ALL = 'ALL';



/** Sentinel for "projects that genuinely have no client" — internal work. Mirrored in
 *  EodByEmployeeReportService; a blank client already means "no filter", so it cannot be reused. */
const NO_CLIENT = '__NONE__';

interface Filters {
  from: string;
  to: string;
  projectId: string;
  client: string;
  teamManagerId: string;
  status: string;
  employeeQuery: string;
}

/** '' (untouched) and ALL both mean "no restriction" on the wire. */
function filterValue(v: string): string | undefined {
  return v === '' || v === ALL ? undefined : v;
}

function filterId(v: string): number | undefined {
  const raw = filterValue(v);
  return raw == null ? undefined : Number(raw);
}

// Dates start blank on purpose: the report covers whatever range the user asks for, and
// pre-filling month-to-date silently decided that for them. The report simply waits until both
// ends are chosen.
function defaultFilters(): Filters {
  return {
    from: '', to: '',
    projectId: '', client: '', teamManagerId: '',
    status: '', employeeQuery: '',
  };
}

/**
 * Employee box with a live suggestion list drawn from the rows the current filters already
 * returned — so it can only ever offer someone the report actually contains. Picking one opens
 * that person's EOD detail rather than just narrowing the table.
 */
function EmployeeSearch({ query, onQueryChange, matches, onPick }: {
  query: string;
  onQueryChange: (v: string) => void;
  matches: EodByEmployeeRowDto[];
  onPick: (employeeId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close when focus or the pointer leaves the control entirely.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const showList = open && query.trim() !== '' && matches.length > 0;

  function pick(id: number) {
    onPick(id);
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} aria-hidden="true" />
      <input
        value={query}
        onChange={e => { onQueryChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          // Enter with exactly one match is the fast path for a fully typed name.
          if (e.key === 'Enter' && showList && matches.length === 1) {
            e.preventDefault();
            pick(matches[0].employeeId);
          }
        }}
        placeholder="Name or ID"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        style={{ ...inputStyle(), paddingLeft: 28 }}
      />
      {showList && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
            maxHeight: 208, overflowY: 'auto',
            background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          }}
        >
          {matches.slice(0, 8).map(m => (
            <button
              key={m.employeeId}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => pick(m.employeeId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px',
                color: 'var(--txt)', fontSize: 12.5,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: 'var(--raised2)', color: 'var(--txt-mut)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700,
              }}>
                {initials(m.employeeName)}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.employeeName}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
                {m.employeeCode}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  filters, onChange, onReset, summary, format, onFormatChange, onDownloadAll, downloadingAll,
  employeeMatches, onPickEmployee,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
  summary: { employeeCount: number; entryCount: number; totalHours: number } | undefined;
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  onDownloadAll: () => void;
  downloadingAll: boolean;
  /** Rows the current filters returned, already narrowed by the typed query. */
  employeeMatches: EodByEmployeeRowDto[];
  onPickEmployee: (employeeId: number) => void;
}) {
  const { data: filterOptions } = useProjectDashboardFilters();

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  // Neither end may be in the future — an EOD report only covers days that have happened.
  // From is additionally bounded by To; To is itself capped at today, so this is the earlier one.
  const today = todayISO();
  const maxFrom = filters.to !== '' ? filters.to : today;

  // Exporting without a range would fall back to the server's default window (month-to-date),
  // silently downloading a period nobody asked for. Same gate the on-screen report uses.
  const hasRange = filters.from !== '' && filters.to !== '';

  return (
    <Card style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>From *</FieldLabel>
          {/* Capped at today: an EOD report only ever covers days that have already happened.
              Still bounded by To as well, so From can never overshoot the other end. */}
          <DatePicker value={filters.from} onChange={v => set('from', v)} max={maxFrom} inputStyle={inputStyle()} quickNav clearable />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>To *</FieldLabel>
          {/* Capped at today for the same reason as From — there are no EODs for days
              that have not happened yet. */}
          <DatePicker value={filters.to} onChange={v => set('to', v)} min={filters.from} max={today} inputStyle={inputStyle()} quickNav clearable />
        </label>
        {/* Each select opens on a masked placeholder (disabled, so it cannot be re-picked once
            you have chosen), with the "All …" catch-all still available underneath. */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Project</FieldLabel>
          <FilterSelect
            value={filters.projectId} onChange={v => set('projectId', v)}
            style={selectStyle(filters.projectId)} label="project"
          >
            <option value="" disabled>Select Project…</option>
            <option style={OPTION_STYLE} value={ALL}>All projects</option>
            {(filterOptions?.projects ?? []).map(p => <option style={OPTION_STYLE} key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Client</FieldLabel>
          <FilterSelect
            value={filters.client} onChange={v => set('client', v)}
            style={selectStyle(filters.client)} label="client"
          >
            <option value="" disabled>Select Client…</option>
            <option style={OPTION_STYLE} value={ALL}>All clients</option>
            {/* Internal work has no client by design — this is the only way to isolate it. */}
            <option style={OPTION_STYLE} value={NO_CLIENT}>W/O Client</option>
            {(filterOptions?.clients ?? []).map(c => <option style={OPTION_STYLE} key={c} value={c}>{c}</option>)}
          </FilterSelect>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Team Lead</FieldLabel>
          <FilterSelect
            value={filters.teamManagerId} onChange={v => set('teamManagerId', v)}
            style={selectStyle(filters.teamManagerId)} label="team lead"
          >
            <option value="" disabled>Select Team Lead…</option>
            <option style={OPTION_STYLE} value={ALL}>All team leads</option>
            {(filterOptions?.teams ?? []).map(t => <option style={OPTION_STYLE} key={t.managerId} value={t.managerId}>{t.managerName}</option>)}
          </FilterSelect>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>EOD Status</FieldLabel>
          <FilterSelect
            value={filters.status} onChange={v => set('status', v)}
            style={selectStyle(filters.status)} label="EOD status"
          >
            <option value="" disabled>Select EOD Status…</option>
            <option style={OPTION_STYLE} value={ALL}>All statuses</option>
            <option style={OPTION_STYLE} value="SUBMITTED">Submitted</option>
            <option style={OPTION_STYLE} value="LATE">Late</option>
            <option style={OPTION_STYLE} value="MISSING">Missing</option>
          </FilterSelect>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Employee</FieldLabel>
          <EmployeeSearch
            query={filters.employeeQuery}
            onQueryChange={v => set('employeeQuery', v)}
            matches={employeeMatches}
            onPick={onPickEmployee}
          />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-mut)' }}>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--brand-bright)', fontWeight: 700 }}>{summary?.employeeCount ?? 0}</span> employees ·{' '}
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--brand-bright)', fontWeight: 700 }}>{summary?.entryCount ?? 0}</span> EOD entries ·{' '}
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--brand-bright)', fontWeight: 700 }}>{hrs(summary?.totalHours ?? 0)}</span> hrs in range
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--line2)', borderRadius: 8, overflow: 'hidden' }}>
          {EXPORT_FORMATS.map(f => (
            <button
              key={f.key}
              onClick={() => onFormatChange(f.key)}
              style={{
                padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: format === f.key ? 'var(--brand)' : 'transparent', color: format === f.key ? '#fff' : 'var(--txt-mut)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={onDownloadAll}
          disabled={downloadingAll || !hasRange}
          title={hasRange ? undefined : 'Choose a From Date and a To Date first'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: hasRange ? 'var(--brand)' : 'var(--raised2)',
            border: hasRange ? '1px solid var(--brand)' : '1px solid var(--line2)',
            borderRadius: 8, color: hasRange ? '#fff' : 'var(--txt-dim)',
            fontSize: 12, fontWeight: 600,
            cursor: downloadingAll || !hasRange ? 'not-allowed' : 'pointer', padding: '7px 12px',
            opacity: downloadingAll ? 0.6 : 1,
          }}
        >
          <Download size={13} aria-hidden="true" /> {downloadingAll ? 'Preparing…' : 'Download all'}
        </button>
        <button
          onClick={onReset}
          style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 12px' }}
        >
          Reset filters
        </button>
      </div>
    </Card>
  );
}

// ── roster + detail pane flow ───────────────────────────────────────────────────

const ROSTER_PAGE_SIZE = 9;

// Detail-pane entry table — header row and body rows must share one template
// or the columns desync.
const ENTRY_TABLE_COLUMNS = '100px 1.1fr 1.4fr 62px';
const ENTRY_TABLE_MIN_WIDTH = 460;

function RosterFlow({
  employees, isLoading, onExport, exportingKey, selectedId, setSelectedId,
}: {
  employees: EodByEmployeeRowDto[];
  isLoading: boolean;
  onExport: (key: string, employeeIds?: number[]) => void;
  exportingKey: string | null;
  // Owned by the page so the Employee search box can open someone's detail directly.
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
}) {
  const [page, setPage] = useState(0);
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>('desc');
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggleChecked(id: number) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  }

  useEffect(() => {
    if (employees.length === 0) { setSelectedId(null); return; }
    if (!employees.some(e => e.employeeId === selectedId)) setSelectedId(employees[0].employeeId);
  }, [employees, selectedId]);

  useEffect(() => { setPage(0); }, [employees.length]);

  const pageCount = Math.max(1, Math.ceil(employees.length / ROSTER_PAGE_SIZE));
  const pageRows = employees.slice(page * ROSTER_PAGE_SIZE, (page + 1) * ROSTER_PAGE_SIZE);
  const selected = employees.find(e => e.employeeId === selectedId) ?? null;
  const sortedEntries = useMemo(() => {
    if (!selected) return [];
    const sign = dateSort === 'asc' ? 1 : -1;
    return [...selected.entries].sort((a, b) => sign * a.date.localeCompare(b.date));
  }, [selected, dateSort]);

  // The minmax floors sum to 776px and cannot shrink; .nf-r-stack replaces the
  // template entirely below 1024px, which is what removes the floor.
  return (
    <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(340px,0.85fr) minmax(420px,1.3fr)', gap: 16, alignItems: 'start' }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--line)', background: 'var(--raised)' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>Employees</span>
          <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{employees.length ? `${page * ROSTER_PAGE_SIZE + 1}–${Math.min((page + 1) * ROSTER_PAGE_SIZE, employees.length)} of ${employees.length}` : '0 in scope'}</span>
        </div>
        {checked.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            background: 'var(--raised)', borderBottom: '1px solid rgba(177,17,22,.4)', padding: '8px 16px',
          }}>
            <span style={{ fontSize: 12.5, color: 'var(--txt)' }}>{checked.size} selected</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setChecked(new Set())} style={{ background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '5px 10px' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--txt-mut)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line2)')}>Clear</button>
              <button
                onClick={() => onExport('selected', [...checked])}
                disabled={exportingKey === 'selected'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 6, color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: exportingKey === 'selected' ? 'not-allowed' : 'pointer', padding: '5px 10px', opacity: exportingKey === 'selected' ? 0.6 : 1 }}
              >
                <Download size={12} aria-hidden="true" /> {exportingKey === 'selected' ? 'Preparing…' : 'Download selected'}
              </button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div style={{ padding: 16 }}>{[0, 1, 2].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={14} /></div>)}</div>
        ) : pageRows.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>No employees match the current filters.</div>
        ) : (
          pageRows.map(r => {
            const rowExportKey = `emp-${r.employeeId}`;
            return (
              <div
                key={r.employeeId}
                onClick={() => setSelectedId(r.employeeId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--line)',
                  background: r.employeeId === selectedId ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked.has(r.employeeId)}
                  onChange={() => toggleChecked(r.employeeId)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 14, height: 14, accentColor: 'var(--brand-bright)', cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                  background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
                }}>
                  {initials(r.employeeName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.employeeName}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[r.designationName, r.employeeCode].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: r.entryCount === 0 ? 'var(--risk)' : 'var(--txt)', flexShrink: 0, minWidth: 20 }}>{r.entryCount}</div>
                <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-mut)', flexShrink: 0, minWidth: 34 }}>{hrs(r.totalHours)}</div>
                <button
                  onClick={e => { e.stopPropagation(); onExport(rowExportKey, [r.employeeId]); }}
                  disabled={exportingKey === rowExportKey}
                  title="Download this employee's EOD"
                  style={{ background: 'none', border: 'none', color: exportingKey === rowExportKey ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: exportingKey === rowExportKey ? 'not-allowed' : 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
                >
                  <Download size={13} aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
        {employees.length > ROSTER_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: 'none', border: 'none', color: page === 0 ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Prev</button>
            <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>Page {page + 1} / {pageCount}</span>
            <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={{ background: 'none', border: 'none', color: page >= pageCount - 1 ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Next</button>
          </div>
        )}
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>Select an employee to view their EOD entries.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700,
                  background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
                }}>
                  {initials(selected.employeeName)}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>{selected.employeeName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
                    {[selected.designationName, selected.employeeCode, selected.client, selected.managerName ? `reports to ${selected.managerName}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <StatusChip status={selected.status} />
                <button
                  onClick={() => onExport(`emp-${selected.employeeId}`, [selected.employeeId])}
                  disabled={exportingKey === `emp-${selected.employeeId}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 6, color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: exportingKey === `emp-${selected.employeeId}` ? 'not-allowed' : 'pointer', padding: '5px 10px', opacity: exportingKey === `emp-${selected.employeeId}` ? 0.6 : 1 }}
                >
                  <Download size={12} aria-hidden="true" /> {exportingKey === `emp-${selected.employeeId}` ? 'Preparing…' : 'Download'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid var(--line)' }}>
              {[
                ['Entries', String(selected.entryCount)],
                ['Days logged', String(new Set(selected.entries.map(e => e.date)).size)],
                ['Total hrs', hrs(selected.totalHours)],
              ].map(([label, value], i) => (
                <div key={label} style={{ padding: '10px 14px', borderLeft: i > 0 ? '1px solid var(--line)' : undefined }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Header and the scrollable body below share one horizontal scroll
                region, so the columns stay aligned while swiping. */}
            <div className="nf-r-scroll">
            <div className="nf-r-scroll-inner" style={{ '--nf-r-min': ENTRY_TABLE_MIN_WIDTH + 'px' } as React.CSSProperties}>
            <div style={{ display: 'grid', gridTemplateColumns: ENTRY_TABLE_COLUMNS, padding: '8px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--txt-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--line)' }}>
              <div
                onClick={() => setDateSort(s => s === 'asc' ? 'desc' : 'asc')}
                style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}
                title="Sort by entry date"
              >
                Entry date {dateSort === 'asc' ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronUp size={11} aria-hidden="true" />}
              </div>
              <div>Project</div><div>Category</div><div style={{ textAlign: 'right' }}>Hours</div>
            </div>
            <div style={{ maxHeight: 396, overflowY: 'auto' }}>
              {sortedEntries.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>No EOD entries match the current filters for this employee.</div>
              ) : sortedEntries.map((e, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: ENTRY_TABLE_COLUMNS, padding: '7px 16px', fontSize: 12, borderBottom: '1px solid var(--line)', alignItems: 'start' }}>
                  {/* The adjustment is per-DAY, so it rides the same "first row of this date" test
                      the date itself uses — printed once, blank on the day's later task rows. */}
                  <div style={{ color: 'var(--txt)' }}>
                    {i === 0 || sortedEntries[i - 1].date !== e.date ? (
                      <>
                        <div style={{ fontFamily: '"JetBrains Mono", monospace' }}>{formatDate(e.date)}</div>
                        <TimeAdjustmentBadge entry={e} />
                      </>
                    ) : ''}
                  </div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)' }}>{e.projectCode ?? '—'}</div>
                  <div style={{ color: 'var(--txt-mut)' }}>{e.categoryName ?? '—'}</div>
                  <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'var(--txt)' }}>{hrs(e.hours)}</div>
                </div>
              ))}
            </div>
            </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── whole-team grouped flow ──────────────────────────────────────────────────────

const TEAM_PAGE_SIZE = 12;

// Header row and body rows must share one template or the columns desync.
const TEAM_ENTRY_COLUMNS = '1.4fr 100px 1.1fr 1.3fr 60px';
const TEAM_ENTRY_MIN_WIDTH = 580;

function TeamFlow({
  employees, isLoading, onExport, exportingKey,
}: {
  employees: EodByEmployeeRowDto[];
  isLoading: boolean;
  onExport: (key: string, employeeIds?: number[]) => void;
  exportingKey: string | null;
}) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(true);

  useEffect(() => { setPage(0); }, [employees.length]);

  const pageCount = Math.max(1, Math.ceil(employees.length / TEAM_PAGE_SIZE));
  const pageRows = employees.slice(page * TEAM_PAGE_SIZE, (page + 1) * TEAM_PAGE_SIZE);

  function toggle(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  function isOpen(id: number): boolean {
    return showAll ? !expanded.has(id) : expanded.has(id);
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--line)', background: 'var(--raised)' }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--txt)' }}>Everyone's EOD entries</span>
        <button
          onClick={() => { setShowAll(s => !s); setExpanded(new Set()); }}
          style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 12px' }}
        >
          {showAll ? 'Hide entries' : 'Show entries'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: 16 }}>{[0, 1, 2].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={14} /></div>)}</div>
      ) : pageRows.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>No EOD entries match these filters. Widen the date range or clear a filter.</div>
      ) : (
        // Scrolls vertically through employees and horizontally through the entry
        // columns; the minWidth on each group keeps that employee's summary row
        // and its expanded entry rows on the same horizontal track.
        <div className="nf-r-scroll" style={{ maxHeight: 560, overflowY: 'auto' }}>
          {pageRows.map(r => {
            const open = isOpen(r.employeeId);
            const entriesAsc = [...r.entries].sort((a, b) => a.date.localeCompare(b.date));
            return (
              <div key={r.employeeId} className="nf-r-scroll-inner" style={{ borderBottom: '1px solid var(--line)', '--nf-r-min': TEAM_ENTRY_MIN_WIDTH + 'px' } as React.CSSProperties}>
                <div
                  onClick={() => toggle(r.employeeId)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'pointer' }}
                >
                  {open ? <ChevronDown size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" /> : <ChevronRight size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />}
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                    background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
                  }}>
                    {initials(r.employeeName)}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--txt)', minWidth: 140 }}>{r.employeeName}</span>
                  {/* The codes themselves, not a "2 projects" count — the count told you there was
                      something to know without telling you what it was, and this column already
                      printed the code whenever there happened to be exactly one. Long lists
                      ellipsize; the full set stays available on hover. */}
                  <span
                    title={r.projectCodes.length > 0
                      ? `Assigned to ${r.projectCodes.join(', ')}`
                      : 'No project assignments in this range'}
                    style={{
                      fontSize: 11, color: 'var(--txt-mut)', maxWidth: 220,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {r.projectCodes.length > 0 ? r.projectCodes.join(', ') : '—'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{r.entryCount} {r.entryCount === 1 ? 'entry' : 'entries'}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>{hrs(r.totalHours)}</span>
                  <StatusChip status={r.status} />
                  <button
                    onClick={e => { e.stopPropagation(); onExport(`emp-${r.employeeId}`, [r.employeeId]); }}
                    disabled={exportingKey === `emp-${r.employeeId}`}
                    title="Download this employee's EOD"
                    style={{ background: 'none', border: 'none', color: exportingKey === `emp-${r.employeeId}` ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: exportingKey === `emp-${r.employeeId}` ? 'not-allowed' : 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
                  >
                    <Download size={13} aria-hidden="true" />
                  </button>
                </div>
                {open && entriesAsc.map((e, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: TEAM_ENTRY_COLUMNS,
                    padding: '5px 16px 5px 52px', fontSize: 11.5, color: 'var(--txt-mut)',
                    alignItems: 'start',
                  }}>
                    <span>{r.designationName ?? '—'}</span>
                    {/* Same per-day rule as the detail pane above. */}
                    <span>
                      {i === 0 || entriesAsc[i - 1].date !== e.date ? (
                        <>
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', display: 'block' }}>{formatDate(e.date)}</span>
                          <TimeAdjustmentBadge entry={e} />
                        </>
                      ) : ''}
                    </span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{e.projectCode ?? '—'}</span>
                    <span>{e.categoryName ?? '—'}</span>
                    <span style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)' }}>{hrs(e.hours)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {employees.length > TEAM_PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: 'none', border: 'none', color: page === 0 ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Prev</button>
          <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>Page {page + 1} of {pageCount}</span>
          <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={{ background: 'none', border: 'none', color: page >= pageCount - 1 ? 'var(--txt-dim)' : 'var(--brand-bright)', cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Next</button>
        </div>
      )}
    </Card>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function EodByEmployeeReport() {
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [flow, setFlow] = useState<'roster' | 'team'>('roster');
  const [format, setFormat] = useState<ExportFormat>('EXCEL');
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const { show } = useToast();

  // Both ends are required by the endpoint, so nothing is requested until both are picked.
  const hasRange = filters.from !== '' && filters.to !== '';

  const { data, isLoading, isError, refetch } = useEodByEmployeeReport({
    from: filters.from,
    to: filters.to,
    projectId: filterId(filters.projectId),
    client: filterValue(filters.client),
    teamManagerId: filterId(filters.teamManagerId),
    status: filterValue(filters.status),
    employeeQuery: filterValue(filters.employeeQuery),
  }, hasRange);

  const employees = useMemo(() => data?.employees ?? [], [data]);

  // Suggestions for the Employee box: the rows these filters already returned, matched on name
  // or code. Client-side because the list is small and it keeps the dropdown instant.
  const employeeMatches = useMemo(() => {
    const q = filters.employeeQuery.trim().toLowerCase();
    if (q === '') return [];
    return employees.filter(e =>
      e.employeeName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q));
  }, [employees, filters.employeeQuery]);

  // Selection lives here so the search box can drive the detail pane, not just the roster list.
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function pickEmployee(employeeId: number) {
    setFlow('roster');           // the detail pane only exists in the roster flow
    setSelectedId(employeeId);
  }

  async function runExport(key: string, employeeIds?: number[]) {
    // Belt and braces: the button is disabled without a range, but the export endpoint falls
    // back to a default window if from/to are blank, so never let a call through without one.
    if (!hasRange) return;
    setExportingKey(key);
    try {
      await exportEodByEmployee({
        from: filters.from,
        to: filters.to,
        projectId: filterId(filters.projectId),
        client: filterValue(filters.client),
        teamManagerId: filterId(filters.teamManagerId),
        status: filterValue(filters.status),
        employeeQuery: filterValue(filters.employeeQuery),
        employeeIds,
        format,
      });
      show('Download started.', 'success');
    } catch {
      show('Export failed. Please try again.', 'error');
    } finally {
      setExportingKey(null);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: 8 }}>
          How do you want to look at EODs?
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line2)', borderRadius: 8, overflow: 'hidden' }}>
          {([['roster', 'Pick a person'], ['team', 'See the whole team']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFlow(key)}
              style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                background: flow === key ? 'var(--brand)' : 'transparent', color: flow === key ? '#fff' : 'var(--txt-mut)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <FilterBar
        filters={filters} onChange={setFilters} onReset={() => setFilters(defaultFilters())} summary={data}
        format={format} onFormatChange={setFormat}
        onDownloadAll={() => runExport('all')} downloadingAll={exportingKey === 'all'}
        employeeMatches={employeeMatches} onPickEmployee={pickEmployee}
      />

      {!hasRange ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            Choose a From Date and a To Date to run the report.
          </div>
        </Card>
      ) : isError ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load the EOD report.</div>
          <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      ) : flow === 'roster' ? (
        <RosterFlow
          employees={employees} isLoading={isLoading} onExport={runExport} exportingKey={exportingKey}
          selectedId={selectedId} setSelectedId={setSelectedId}
        />
      ) : (
        <TeamFlow employees={employees} isLoading={isLoading} onExport={runExport} exportingKey={exportingKey} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 11.5, color: 'var(--txt-dim)' }}>
        <Users size={13} aria-hidden="true" />
        Scoped to the employees allocated to your projects in this date range.
      </div>
    </div>
  );
}
