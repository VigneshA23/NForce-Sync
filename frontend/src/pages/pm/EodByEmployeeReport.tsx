import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Download, RefreshCw, Search, Users } from 'lucide-react';
import { DatePicker } from '../../components/DatePicker';
import { formatDate } from '../../lib/date';
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

function firstDayOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--txt-dim)', textTransform: 'uppercase' }}>
      {children}
    </span>
  );
}

// ── filter bar ─────────────────────────────────────────────────────────────────

interface Filters {
  from: string;
  to: string;
  projectId: number | undefined;
  client: string;
  teamManagerId: number | undefined;
  status: string;
  billable: string;
  employeeQuery: string;
}

function defaultFilters(): Filters {
  return {
    from: firstDayOfMonthISO(), to: todayISO(),
    projectId: undefined, client: '', teamManagerId: undefined,
    status: '', billable: '', employeeQuery: '',
  };
}

function FilterBar({
  filters, onChange, onReset, summary, format, onFormatChange, onDownloadAll, downloadingAll,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
  summary: { employeeCount: number; entryCount: number; totalHours: number } | undefined;
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  onDownloadAll: () => void;
  downloadingAll: boolean;
}) {
  const { data: filterOptions } = useProjectDashboardFilters();

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <Card style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>From</FieldLabel>
          <DatePicker value={filters.from} onChange={v => set('from', v)} max={filters.to} inputStyle={inputStyle()} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>To</FieldLabel>
          <DatePicker value={filters.to} onChange={v => set('to', v)} min={filters.from} inputStyle={inputStyle()} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Project</FieldLabel>
          <select style={inputStyle()} value={filters.projectId ?? ''} onChange={e => set('projectId', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All projects</option>
            {(filterOptions?.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Client</FieldLabel>
          <select style={inputStyle()} value={filters.client} onChange={e => set('client', e.target.value)}>
            <option value="">All clients</option>
            {(filterOptions?.clients ?? []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Team Lead</FieldLabel>
          <select style={inputStyle()} value={filters.teamManagerId ?? ''} onChange={e => set('teamManagerId', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All team leads</option>
            {(filterOptions?.teams ?? []).map(t => <option key={t.managerId} value={t.managerId}>{t.managerName}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>EOD Status</FieldLabel>
          <select style={inputStyle()} value={filters.status} onChange={e => set('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="LATE">Late</option>
            <option value="MISSING">Missing</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Billable or Internal</FieldLabel>
          <select style={inputStyle()} value={filters.billable} onChange={e => set('billable', e.target.value)}>
            <option value="">All work</option>
            <option value="BILLABLE">Billable only</option>
            <option value="INTERNAL">Internal only</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <FieldLabel>Employee</FieldLabel>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)' }} aria-hidden="true" />
            <input
              value={filters.employeeQuery}
              onChange={e => set('employeeQuery', e.target.value)}
              placeholder="Name or ID"
              style={{ ...inputStyle(), paddingLeft: 28 }}
            />
          </div>
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
          disabled={downloadingAll}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--brand)', border: '1px solid var(--brand)', borderRadius: 8, color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: downloadingAll ? 'not-allowed' : 'pointer', padding: '7px 12px',
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

function RosterFlow({
  employees, isLoading, onExport, exportingKey,
}: {
  employees: EodByEmployeeRowDto[];
  isLoading: boolean;
  onExport: (key: string, employeeIds?: number[]) => void;
  exportingKey: string | null;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px,0.85fr) minmax(420px,1.3fr)', gap: 16, alignItems: 'start' }}>
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
              <button onClick={() => setChecked(new Set())} style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt-mut)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '5px 10px' }}>Clear</button>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--line)' }}>
              {[
                ['Entries', String(selected.entryCount)],
                ['Days logged', String(new Set(selected.entries.map(e => e.date)).size)],
                ['Total hrs', hrs(selected.totalHours)],
                ['Billable hrs', hrs(selected.billableHours)],
              ].map(([label, value], i) => (
                <div key={label} style={{ padding: '10px 14px', borderLeft: i > 0 ? '1px solid var(--line)' : undefined }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--txt-dim)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '100px 1.1fr 1.4fr 62px 74px', padding: '8px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--txt-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--line)' }}>
              <div
                onClick={() => setDateSort(s => s === 'asc' ? 'desc' : 'asc')}
                style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}
                title="Sort by entry date"
              >
                Entry date {dateSort === 'asc' ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronUp size={11} aria-hidden="true" />}
              </div>
              <div>Project</div><div>Category</div><div style={{ textAlign: 'right' }}>Hours</div><div style={{ textAlign: 'center' }}>Billable</div>
            </div>
            <div style={{ maxHeight: 396, overflowY: 'auto' }}>
              {sortedEntries.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--txt-dim)' }}>No EOD entries match the current filters for this employee.</div>
              ) : sortedEntries.map((e, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1.1fr 1.4fr 62px 74px', padding: '7px 16px', fontSize: 12, borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)' }}>{i === 0 || sortedEntries[i - 1].date !== e.date ? formatDate(e.date) : ''}</div>
                  <div style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)' }}>{e.projectCode ?? '—'}</div>
                  <div style={{ color: 'var(--txt-mut)' }}>{e.categoryName ?? '—'}</div>
                  <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'var(--txt)' }}>{hrs(e.hours)}</div>
                  <div style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: e.billable ? 'var(--ok)' : 'var(--txt-dim)' }}>{e.billable ? 'BILLABLE' : 'INTERNAL'}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── whole-team grouped flow ──────────────────────────────────────────────────────

const TEAM_PAGE_SIZE = 12;

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
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          {pageRows.map(r => {
            const open = isOpen(r.employeeId);
            const entriesAsc = [...r.entries].sort((a, b) => a.date.localeCompare(b.date));
            const dates = entriesAsc.map(e => e.date);
            const span = dates.length ? `${formatDate(dates[0])} → ${formatDate(dates[dates.length - 1])}` : '—';
            return (
              <div key={r.employeeId} style={{ borderBottom: '1px solid var(--line)' }}>
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
                  <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>{span}</span>
                  <span style={{ fontSize: 11, color: 'var(--txt-mut)' }}>{r.projectCodes.length > 1 ? `${r.projectCodes.length} projects` : (r.projectCodes[0] ?? '—')}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>{r.entryCount} {r.entryCount === 1 ? 'entry' : 'entries'}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>{hrs(r.totalHours)}</span>
                  <span style={{ fontSize: 11, color: 'var(--ok)', fontFamily: '"JetBrains Mono", monospace' }}>{hrs(r.billableHours)} b</span>
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
                    display: 'grid', gridTemplateColumns: '1.4fr 100px 1.1fr 1.3fr 60px 72px',
                    padding: '5px 16px 5px 52px', fontSize: 11.5, color: 'var(--txt-mut)',
                  }}>
                    <span>{r.designationName ?? '—'}</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{i === 0 || entriesAsc[i - 1].date !== e.date ? formatDate(e.date) : ''}</span>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{e.projectCode ?? '—'}</span>
                    <span>{e.categoryName ?? '—'}</span>
                    <span style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)' }}>{hrs(e.hours)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: e.billable ? 'var(--ok)' : 'var(--txt-dim)' }}>{e.billable ? 'BILLABLE' : 'INTERNAL'}</span>
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

  const { data, isLoading, isError, refetch } = useEodByEmployeeReport({
    from: filters.from,
    to: filters.to,
    projectId: filters.projectId,
    client: filters.client || undefined,
    teamManagerId: filters.teamManagerId,
    status: filters.status || undefined,
    billable: filters.billable || undefined,
    employeeQuery: filters.employeeQuery || undefined,
  });

  const employees = useMemo(() => data?.employees ?? [], [data]);

  async function runExport(key: string, employeeIds?: number[]) {
    setExportingKey(key);
    try {
      await exportEodByEmployee({
        from: filters.from,
        to: filters.to,
        projectId: filters.projectId,
        client: filters.client || undefined,
        teamManagerId: filters.teamManagerId,
        status: filters.status || undefined,
        billable: filters.billable || undefined,
        employeeQuery: filters.employeeQuery || undefined,
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
      />

      {isError ? (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load the EOD report.</div>
          <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      ) : flow === 'roster' ? (
        <RosterFlow employees={employees} isLoading={isLoading} onExport={runExport} exportingKey={exportingKey} />
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
