import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderKanban, CheckCircle2, PauseCircle, Archive, Gauge,
  AlertTriangle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, X,
} from 'lucide-react';
import { KpiCard, ClickableKpi } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { Pagination } from '../../components/Pagination';
import { ReportDateRange } from '../../components/ReportDateRange';
import type { DateRange, ReportRangePreset } from '../../lib/dateRange';
import { initialReportRange } from '../../lib/reportDefaultRange';
import { useReportPreset } from '../../lib/useReportPreset';
import { useAuth } from '../../lib/auth';
import { searchUsers } from '../../api/admin';
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
  // Stays visible while a scrollable table body (maxHeight + overflowY) scrolls past it —
  // inert on tables that don't scroll.
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

// Rows per page for the Project-wise Utilization / Resource Utilization / Missing EOD tables
// below — the shared Pagination component handles the rest, so these no longer need their own
// internal scroll-to-see-more container.
const DASHBOARD_TABLE_PAGE_SIZE = 5;

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  color: 'var(--txt)',
};


function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
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

// ── filter bar ─────────────────────────────────────────────────────────────────

interface Filters {
  from: string;
  to: string;
  projectId: string;
  employeeId: string;
  teamManagerId: string;
  client: string;
  /** Super Admin-only — see ProjectDashboardFilterParams.pmId. Always '' for a PM caller. */
  pmId: string;
}

// Super Admin-only "view as Project Manager" narrowing (Reportee Views enhancement) — never
// rendered for a PM, whose portfolio is always resolved server-side from their own id.
function PmScopeSelect({ value, onChange }: { value: string; onChange: (pmId: string) => void }) {
  const { data: pms } = useQuery({
    queryKey: ['users', 'search', 'PM'],
    queryFn: () => searchUsers({ role: 'PM' }),
    staleTime: 5 * 60_000,
  });
  return (
    <select
      aria-label="Filter by Project Manager"
      style={{ ...inputStyle, width: 200 }}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">All Project Managers (system-wide)</option>
      {(pms ?? []).map(pm => <option key={pm.id} value={pm.id}>{pm.fullName}</option>)}
    </select>
  );
}

function FilterBar({ filters, onChange, onClear, preset, onPresetSelect, isSuperAdmin }: {
  filters: Filters; onChange: (next: Filters) => void; onClear: () => void;
  preset: ReportRangePreset; onPresetSelect: (preset: ReportRangePreset) => void;
  isSuperAdmin: boolean;
}) {
  const { data: options } = useProjectDashboardFilters(filters.pmId ? Number(filters.pmId) : undefined);
  const defaultRange = initialReportRange();
  const rangeIsDefault = filters.from === defaultRange.from && filters.to === defaultRange.to;

  return (
    <Card style={{ padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {isSuperAdmin && (
          <PmScopeSelect
            value={filters.pmId}
            onChange={pmId => onChange({ ...filters, pmId, projectId: '', employeeId: '', teamManagerId: '', client: '' })}
          />
        )}

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

        {(filters.projectId || filters.employeeId || filters.teamManagerId || filters.client || !rangeIsDefault) && (
          <button
            type="button"
            onClick={onClear}
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
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <ReportDateRange
          range={{ from: filters.from, to: filters.to }} preset={preset} onPresetSelect={onPresetSelect} clearable
          onRangeChange={next => onChange({ ...filters, ...next })}
        />
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
  const [page, setPage] = useState(1);

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

  // Clamped rather than reset-on-filter-change: a search/sort edit that shrinks the list just
  // lands on the new last page instead of needing its own effect to snap back to page 1.
  const totalPages = Math.max(1, Math.ceil(filtered.length / DASHBOARD_TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * DASHBOARD_TABLE_PAGE_SIZE, pageSafe * DASHBOARD_TABLE_PAGE_SIZE);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeaderWithSearch
        title="Project-wise Utilization" subtitle="Planned vs. actual hours logged, per project"
        search={search} onSearchChange={setSearch} placeholder="Search project..."
      />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No data for the selected filters.</div>
      ) : (
        <>
        <div style={{ overflow: 'auto' }}>
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
              {paged.map(r => (
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
        {filtered.length > 0 && (
          <Pagination
            page={pageSafe} totalPages={totalPages} totalItems={filtered.length} pageSize={DASHBOARD_TABLE_PAGE_SIZE}
            onPageChange={setPage} itemLabel="projects"
          />
        )}
        </>
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
  const [page, setPage] = useState(1);

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

  // Clamped rather than reset-on-filter-change: a search/sort edit that shrinks the list just
  // lands on the new last page instead of needing its own effect to snap back to page 1.
  const totalPages = Math.max(1, Math.ceil(filtered.length / DASHBOARD_TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * DASHBOARD_TABLE_PAGE_SIZE, pageSafe * DASHBOARD_TABLE_PAGE_SIZE);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeaderWithSearch
        title="Resource Utilization" subtitle="Per-employee allocation vs. logged hours"
        search={search} onSearchChange={setSearch}
      />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No data for the selected filters.</div>
      ) : (
        <>
        <div style={{ overflow: 'auto' }}>
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
              {paged.map((r, i) => (
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
        {filtered.length > 0 && (
          <Pagination
            page={pageSafe} totalPages={totalPages} totalItems={filtered.length} pageSize={DASHBOARD_TABLE_PAGE_SIZE}
            onPageChange={setPage} itemLabel="employees"
          />
        )}
        </>
      )}
    </Card>
  );
}

// ── missing EOD table ────────────────────────────────────────────────────────────

function MissingEodTable({ rows }: { rows: MissingEodRowDto[] }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return term === '' ? rows : rows.filter(r => r.employeeName.toLowerCase().includes(term));
  }, [rows, debouncedSearch]);

  // Clamped rather than reset-on-filter-change: a search edit that shrinks the list just lands
  // on the new last page instead of needing its own effect to snap back to page 1.
  const totalPages = Math.max(1, Math.ceil(filtered.length / DASHBOARD_TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * DASHBOARD_TABLE_PAGE_SIZE, pageSafe * DASHBOARD_TABLE_PAGE_SIZE);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <SectionHeaderWithSearch
        title="Missing EOD Submission Breakdown" subtitle="Working days in range with no submitted/approved EOD"
        search={search} onSearchChange={setSearch}
      />
      {rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No missing submissions in this range.</div>
      ) : (
        <>
        <div style={{ overflow: 'auto' }}>
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
              {paged.map(r => {
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
        {filtered.length > 0 && (
          <Pagination
            page={pageSafe} totalPages={totalPages} totalItems={filtered.length} pageSize={DASHBOARD_TABLE_PAGE_SIZE}
            onPageChange={setPage} itemLabel="employees"
          />
        )}
        </>
      )}
    </Card>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function ProjectDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user!.role === 'superadmin';
  // From/To default to the 1st of the current month through today, computed fresh off the
  // real local date (never a fixed month/year) — and are never persisted to storage, so this
  // lazy useState re-derives that same default on every fresh mount, including the one that
  // follows a logout/login (the protected route tree unmounts entirely on logout). Any custom
  // dates a user picks live only in this instance's state and vanish with it — the next login,
  // by the same user or a different one, always starts from this computed default again.
  const [filters, setFilters] = useState<Filters>(() => ({
    ...initialReportRange(),
    projectId: '', employeeId: '', teamManagerId: '', client: '', pmId: '',
  }));
  // Preset pills: picking one sets From/To; editing either date by hand makes Custom active (useReportPreset).
  const { preset, onPresetSelect, noteRangeEdit, reset: resetPreset } = useReportPreset(
    ({ from, to }: DateRange) => setFilters(f => ({ ...f, from, to })),
  );
  function handleFilterChange(next: Filters) {
    noteRangeEdit(filters, next);
    setFilters(next);
  }
  // "Clear" puts everything back to the defaults, including the date range (This month → today).
  function handleClear() {
    resetPreset();
    setFilters(f => ({ ...f, ...initialReportRange(), projectId: '', employeeId: '', teamManagerId: '', client: '' }));
  }
  // Both ends are needed to show a range. Clearing one blanks the picker and shows a notice; the
  // picker caps To at today and bounds From by To, so From > To can't be entered.
  const rangeValid = filters.from !== '' && filters.to !== '';

  const { data, isPending, isError, refetch } = useProjectDashboardSummary({
    from: filters.from || undefined,
    to: filters.to || undefined,
    projectId: filters.projectId ? Number(filters.projectId) : undefined,
    employeeId: filters.employeeId ? Number(filters.employeeId) : undefined,
    teamManagerId: filters.teamManagerId ? Number(filters.teamManagerId) : undefined,
    client: filters.client || undefined,
    pmId: isSuperAdmin && filters.pmId ? Number(filters.pmId) : undefined,
  }, rangeValid);

  if (isPending) {
    return <GlobalLoader fullScreen={false} />;
  }

  if (isError || !data) {
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Project Dashboard</h1>
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

  const { cards, projectUtilization, resourceUtilization, missingEod } = data;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <HeroBanner subtitle="Resource utilization, project health and EOD compliance across your portfolio." />
      </div>

      <FilterBar
        filters={filters} onChange={handleFilterChange} onClear={handleClear}
        preset={preset} onPresetSelect={onPresetSelect} isSuperAdmin={isSuperAdmin}
      />

      {!rangeValid ? (
        <Card style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            Enter valid From and To dates to view the dashboard for that range.
          </div>
        </Card>
      ) : (
        <>
      {/* Summary cards — full-width row */}
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Project counts are informational only — Projects & Allocation is Admin-owned. */}
        <KpiCard icon={<FolderKanban size={17} aria-hidden="true" />} label="Total Projects" value={cards.totalAssignedProjects} />
        <KpiCard icon={<CheckCircle2 size={17} aria-hidden="true" />} label="Active" value={cards.activeProjects} accent="var(--ok)" />
        <KpiCard icon={<PauseCircle size={17} aria-hidden="true" />} label="On Hold" value={cards.onHoldProjects} accent="var(--warn)" />
        <KpiCard icon={<Archive size={17} aria-hidden="true" />} label="Completed" value={cards.completedProjects} accent="var(--info)" />
        <ClickableKpi onClick={() => navigate('/projects/reports?tab=missing')}>
          <KpiCard icon={<AlertTriangle size={17} aria-hidden="true" />} label="Missing EOD" value={cards.missingEodCount} accent={cards.missingEodCount > 0 ? 'var(--risk)' : 'var(--txt)'} />
        </ClickableKpi>
        <ClickableKpi onClick={() => navigate('/projects/utilization')}>
          <KpiCard icon={<Gauge size={17} aria-hidden="true" />} label="Overall Utilization" value={fmtPct(cards.overallUtilizationPct)} accent={utilColor(cards.overallUtilizationPct)} />
        </ClickableKpi>
      </div>

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
