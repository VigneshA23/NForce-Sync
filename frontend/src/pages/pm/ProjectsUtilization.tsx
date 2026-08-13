import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, Activity, DollarSign, Clock, RefreshCw, Layers,
} from 'lucide-react';
import { UtilBar } from '../../components/UtilBar';
import { fmtPct } from '../../lib/rules';
import { todayISO, toLocalISODate } from '../../lib/date';
import {
  useProjectDashboardFilters,
  useProjectDashboardSummary,
  type ProjectDashboardFilterParams,
} from '../../api/projectDashboard';

// ── date range helpers ──────────────────────────────────────────────────────────

function isoMinus(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  return toLocalISODate(d);
}

function firstOfMonth(): string {
  const d = new Date();
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

const RANGES = [
  { label: 'This Month', from: firstOfMonth },
  { label: '4 W',  from: () => isoMinus(4) },
  { label: '8 W',  from: () => isoMinus(8) },
  { label: '3 M',  from: () => isoMinus(13) },
];

// ── primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({
  children, style, pad = 20, className,
}: { children: React.ReactNode; style?: React.CSSProperties; pad?: number; className?: string }) {
  return (
    <div className={`pm-util-card${className ? ` ${className}` : ''}`} style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 10, padding: pad, minWidth: 0, ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, accent = 'var(--txt)',
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <Card className="pm-util-kpi" pad={16}>
      <div style={{ marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${accent} 14%, var(--raised2))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>
          {icon}
        </div>
      </div>
      <div style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 24, fontWeight: 700, color: accent,
        letterSpacing: '-0.02em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', marginBottom: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt-mut)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

// ── billable donut ─────────────────────────────────────────────────────────────

const DONUT_COLORS = ['var(--ok)', 'var(--info)', 'var(--txt-dim)'];

function BillableDonut({ billable, nonBillable }: { billable: number; nonBillable: number }) {
  const total = billable + nonBillable;
  const data = [
    { name: 'Billable',     value: billable },
    { name: 'Non-Billable', value: nonBillable },
  ].filter(d => d.value > 0);

  if (total === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, minWidth: 0 }}>
      <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map((entry, idx) => {
                const colorIdx = ['Billable', 'Non-Billable'].indexOf(entry.name);
                return <Cell key={entry.name} fill={DONUT_COLORS[colorIdx < 0 ? idx : colorIdx]} />;
              })}
            </Pie>
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                return (
                  <div style={{ background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 10px', fontSize: 12 }}>
                    <div style={{ color: 'var(--txt-mut)', marginBottom: 3 }}>{p.name}</div>
                    <div style={{ color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>
                      {Number(p.value).toFixed(1)}h ({total > 0 ? Math.round((Number(p.value) / total) * 100) : 0}%)
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {total.toFixed(0)}h
          </span>
          <span style={{ fontSize: 9, color: 'var(--txt-dim)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { label: 'Billable',     value: billable,    color: DONUT_COLORS[0] },
          { label: 'Non-Billable', value: nonBillable, color: DONUT_COLORS[1] },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--txt-mut)' }}>{label}</span>
            </div>
            <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {value.toFixed(1)}h
              <span style={{ color: 'var(--txt-dim)', marginLeft: 4, fontSize: 10 }}>({total > 0 ? Math.round((value / total) * 100) : 0}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── per-project table ──────────────────────────────────────────────────────────

interface ProjectRow {
  projectId: number;
  projectName: string;
  plannedHours: number;
  actualHours: number;
  variance: number;
  utilizationPct: number;
}

function ProjectTable({ rows }: { rows: ProjectRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--txt-dim)' }}>
        No project data in this range
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 580 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 180px',
          gap: 8, padding: '6px 0 8px', borderBottom: '1px solid var(--line)',
          fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Project</span>
          <span style={{ textAlign: 'right' }}>Planned</span>
          <span style={{ textAlign: 'right' }}>Actual</span>
          <span style={{ textAlign: 'right' }}>Variance</span>
          <span>Util %</span>
        </div>

        {rows.map((row, i) => {
          const isOver = row.variance > 0;
          return (
            <div key={row.projectId} style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 180px',
              gap: 8, padding: '10px 6px', margin: '0 -6px',
              borderRadius: 6, borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.projectName}
              </span>
              <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                {row.plannedHours.toFixed(0)}h
              </span>
              <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                {row.actualHours.toFixed(0)}h
              </span>
              <span style={{ fontSize: 12, textAlign: 'right', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', color: isOver ? 'var(--risk)' : 'var(--ok)' }}>
                {isOver ? '+' : ''}{row.variance.toFixed(0)}h
              </span>
              <UtilBar pct={row.utilizationPct} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── resource utilization table ─────────────────────────────────────────────────

interface ResourceRow {
  employeeId: number;
  employeeName: string;
  projectName: string;
  productiveHours: number;
  availableHours: number;
  utilizationPct: number;
}

const RESOURCE_PAGE_SIZE = 8;

function ResourceTable({ rows }: { rows: ResourceRow[] }) {
  const [page, setPage] = useState(0);
  const sorted = [...rows].sort((a, b) => b.utilizationPct - a.utilizationPct);
  const total  = sorted.length;
  const pages  = Math.ceil(total / RESOURCE_PAGE_SIZE);
  const slice  = sorted.slice(page * RESOURCE_PAGE_SIZE, (page + 1) * RESOURCE_PAGE_SIZE);

  if (total === 0) {
    return <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--txt-dim)' }}>No employee data in this range</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 580 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 160px',
          gap: 8, padding: '6px 0 8px', borderBottom: '1px solid var(--line)',
          fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Employee</span>
          <span>Project</span>
          <span style={{ textAlign: 'right' }}>Approved</span>
          <span style={{ textAlign: 'right' }}>Available</span>
          <span>Util %</span>
        </div>

        {slice.map((row, i) => (
          <div key={`${row.employeeId}-${row.projectName}`} className="pm-util-res-row" style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 160px',
            gap: 8, padding: '9px 6px', margin: '0 -6px',
            borderRadius: 6, borderBottom: i < slice.length - 1 ? '1px solid var(--line)' : 'none',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.employeeName}
            </span>
            <span style={{ fontSize: 11, color: 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.projectName}
            </span>
            <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
              {row.productiveHours.toFixed(1)}h
            </span>
            <span style={{ fontSize: 11, textAlign: 'right', color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
              {row.availableHours.toFixed(0)}h
            </span>
            <UtilBar pct={row.utilizationPct} />
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--txt-dim)' }}>
          <span>{total} resources · page {page + 1} of {pages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {page > 0 && (
              <button onClick={() => setPage(p => p - 1)} style={{ padding: '4px 10px', borderRadius: 5, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', fontSize: 11, cursor: 'pointer' }}>
                ← Prev
              </button>
            )}
            {page < pages - 1 && (
              <button onClick={() => setPage(p => p + 1)} style={{ padding: '4px 10px', borderRadius: 5, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', fontSize: 11, cursor: 'pointer' }}>
                Next →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── category breakdown ─────────────────────────────────────────────────────────

function CategoryTable({ rows }: { rows: { category: string; hours: number; pctOfTotal: number }[] }) {
  if (rows.length === 0) {
    return <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: 'var(--txt-dim)' }}>No category data</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(row => (
        <div key={row.category}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{row.category}</span>
            <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {row.hours.toFixed(1)}h
              <span style={{ color: 'var(--txt-dim)', marginLeft: 4 }}>({Math.round(row.pctOfTotal)}%)</span>
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, row.pctOfTotal)}%`, height: '100%', background: 'var(--brand)', borderRadius: 3, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Skel h={28} w={240} /><div style={{ marginTop: 6 }} /><Skel h={14} w={200} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
            <Skel h={32} w={32} /><div style={{ marginTop: 12 }} />
            <Skel h={24} w="60%" /><div style={{ marginTop: 8 }} /><Skel h={11} w="45%" />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={140} /><div style={{ marginTop: 14 }} />
          {[0,1,2,3].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={36} /></div>)}
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} /><div style={{ marginTop: 16 }} />
          <Skel h={130} /><div style={{ marginTop: 16 }} />
          {[0,1].map(i => <div key={i} style={{ marginBottom: 8 }}><Skel h={14} /></div>)}
        </div>
      </div>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
        <Skel h={14} w={160} /><div style={{ marginTop: 14 }} />
        {[0,1,2,3,4].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={36} /></div>)}
      </div>
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function ProjectsUtilization() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const today = todayISO();
  const from  = RANGES[rangeIdx].from();

  const { data: filters } = useProjectDashboardFilters();

  const filterParams = useMemo<ProjectDashboardFilterParams>(() => ({
    from,
    to: today,
    projectId,
  }), [from, today, projectId]);

  const { data, isPending, isError, refetch } = useProjectDashboardSummary(filterParams);

  const fromLabel = new Date(from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const toLabel   = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  if (isPending) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>
            Projects Utilization
          </h1>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 14 }}>Failed to load utilization data.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const { cards, projectUtilization, resourceUtilization, billableSplit, taskCategoryBreakdown } = data!;

  return (
    <div className="pm-util-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Projects Utilization
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            Only APPROVED hours count · {fromLabel} – {toLabel}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
          {/* Project filter */}
          {filters && filters.projects.length > 1 && (
            <select
              value={projectId ?? ''}
              onChange={e => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
              style={{ background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, cursor: 'pointer' }}
            >
              <option value="">All Projects</option>
              {filters.projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Date range */}
          <div style={{ display: 'flex', gap: 0, background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 7, overflow: 'hidden' }}>
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                style={{
                  padding: '7px 14px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  background: rangeIdx === i ? 'var(--raised2)' : 'none',
                  color: rangeIdx === i ? 'var(--txt)' : 'var(--txt-mut)',
                  borderRight: i < RANGES.length - 1 ? '1px solid var(--line)' : 'none',
                  transition: 'color 0.14s, background 0.14s',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="pm-util-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        <KpiTile
          icon={<TrendingUp size={16} />}
          label="Overall (Actual / Planned)"
          value={fmtPct(cards.overallUtilizationPct)}
          sub={`Planned ${fmtPct(cards.plannedUtilizationPct)} vs Available`}
          accent="var(--brand)"
        />
        <KpiTile
          icon={<Activity size={16} />}
          label="Actual (Approved / Available)"
          value={fmtPct(cards.actualUtilizationPct)}
          sub={`${billableSplit.billableHours.toFixed(0)}h approved total`}
          accent="var(--ok)"
        />
        <KpiTile
          icon={<DollarSign size={16} />}
          label="Billable utilization"
          value={fmtPct(cards.billableUtilizationPct)}
          sub={`${billableSplit.billableHours.toFixed(0)}h billable hours`}
          accent="var(--info)"
        />
        <KpiTile
          icon={<Clock size={16} />}
          label="Non-billable utilization"
          value={fmtPct(cards.nonBillableUtilizationPct)}
          sub={`${billableSplit.nonBillableHours.toFixed(0)}h non-billable`}
          accent="var(--warn)"
        />
      </div>

      {/* Per-project + billable donut row */}
      <div className="pm-util-top-row" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Layers size={12} />Per-Project Breakdown</span></SectionLabel>
          <ProjectTable rows={projectUtilization} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <SectionLabel>Billable Split</SectionLabel>
            <BillableDonut billable={billableSplit.billableHours} nonBillable={billableSplit.nonBillableHours} />
          </Card>

          {taskCategoryBreakdown.length > 0 && (
            <Card>
              <SectionLabel>By Category</SectionLabel>
              <CategoryTable rows={taskCategoryBreakdown.slice(0, 5)} />
            </Card>
          )}
        </div>
      </div>

      {/* Resource utilization table */}
      <Card>
        <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Activity size={12} />Employee Utilization</span></SectionLabel>
        <ResourceTable rows={resourceUtilization} />
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 14, marginTop: 12, borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--txt-mut)' }}>
          {[
            { color: 'var(--ok)',      label: 'Healthy (60–100%)' },
            { color: 'var(--warn)',    label: 'Under (< 60%)' },
            { color: 'var(--risk)',    label: 'Over (> 100%)' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)' }}>
            Utilization = Approved productive hours ÷ Available hours × 100
          </div>
        </div>
      </Card>

      <style>{`
        .pm-util-card { transition: border-color 140ms ease, box-shadow 140ms ease; }
        .pm-util-card:hover { border-color: var(--line2); box-shadow: 0 4px 16px color-mix(in srgb, #000 10%, transparent); }
        .pm-util-kpi:hover { transform: translateY(-1px); transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease; }
        .pm-util-res-row:hover { background: var(--raised2); }

        @media (max-width: 900px) {
          .pm-util-top-row { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .pm-util-kpis { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
