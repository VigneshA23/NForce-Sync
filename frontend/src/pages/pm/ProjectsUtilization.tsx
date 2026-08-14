import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Clock, RefreshCw, Layers,
  Calendar, Download, Lightbulb, AlertTriangle, Users, ArrowUp, ArrowDown, Minus,
  CheckCircle2, Award, FolderKanban, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { UtilBar } from '../../components/UtilBar';
import { SegmentDonut } from '../../components/UtilizationDonut';
import { fmtPct, utilColor, utilState, RULES } from '../../lib/rules';
import { todayISO, toLocalISODate } from '../../lib/date';
import {
  useProjectDashboardFilters,
  useProjectDashboardSummary,
  type ProjectDashboardFilterParams,
  type ProjectUtilizationRowDto,
  type ResourceUtilizationRowDto,
  type UtilizationTrendPointDto,
  type DashboardSummaryCardsDto,
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

function fmtChartDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

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

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
    }}>
      <span>{children}</span>
      {action}
    </div>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--txt-dim)' }}>{children}</div>;
}

// ── mini sparkline (inline SVG, no charting lib needed for a 4px-tall line) ─────

function MiniSparkline({ values, color, width = 60, height = 20 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── delta chip — contextual up/down color, not hardcoded green=up ──────────────
// goodDirection='up' (default): an increase is favorable (green), a decrease is not (red).
// goodDirection='down': the inverse — used for Non-billable, where a rise is the unwelcome trend.

function DeltaChip({ value, suffix = 'pt', goodDirection = 'up' }: {
  value: number | null; suffix?: string; goodDirection?: 'up' | 'down';
}) {
  if (value == null) {
    return <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>vs last month —</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  const isFlat = rounded === 0;
  const isUp = rounded > 0;
  const isGood = isFlat ? null : (goodDirection === 'up' ? isUp : !isUp);
  const color = isFlat ? 'var(--txt-dim)' : isGood ? 'var(--ok)' : 'var(--risk)';
  const Icon = isFlat ? Minus : isUp ? ArrowUp : ArrowDown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color }}>
      <Icon size={10} aria-hidden="true" />
      {Math.abs(rounded)}{suffix} vs last month
    </span>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, accent = 'var(--txt)', delta, deltaSuffix = 'pt', goodDirection = 'up', sparkline,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
  delta?: number | null; deltaSuffix?: string; goodDirection?: 'up' | 'down'; sparkline?: number[];
}) {
  return (
    <Card className="pm-util-kpi" pad={16}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${accent} 14%, var(--raised2))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>
          {icon}
        </div>
        {sparkline && sparkline.length >= 2 && <MiniSparkline values={sparkline} color={accent} />}
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
      {delta !== undefined && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          <DeltaChip value={delta} suffix={deltaSuffix} goodDirection={goodDirection} />
        </div>
      )}
    </Card>
  );
}

// ── utilization trend chart (3 series) ──────────────────────────────────────────

const TREND_SERIES = [
  { key: 'overall',    label: 'Overall',      color: 'var(--brand)' },
  { key: 'billable',   label: 'Billable',     color: 'var(--info)' },
  { key: 'nonBillable', label: 'Non-billable', color: 'var(--warn)' },
] as const;

function UtilizationTrendChart({ points }: { points: UtilizationTrendPointDto[] }) {
  if (points.length === 0) {
    return <EmptyMsg>No utilization data in this range</EmptyMsg>;
  }
  const dense = points.length > 21;
  const data = points.map(p => ({
    day: fmtChartDay(p.date),
    overall: Math.round(p.overallPct),
    billable: Math.round(p.billablePct),
    nonBillable: Math.round(p.nonBillablePct),
  }));

  // Recharts' category XAxis auto-thins ticks to avoid overlap whenever `interval` is left as a
  // string preset — without `interval={0}` it silently drops whichever day labels it decides
  // won't fit, which reads as missing days on the chart even though every day's point is present
  // in `data` (built directly from `points`, one entry per day the API returned). Mirrors the same
  // fix already applied to TeamUtilization.tsx's WeeklyTrendChart for the identical symptom.
  // Only forced for non-dense ranges (≤21 days, i.e. This Month / short custom ranges) — dense
  // ranges (4W/8W/3M) intentionally thin labels via a numeric interval below so 60-90 days of
  // ticks stay legible; their underlying line is still unbroken, just not every day is labeled.
  const XAxisTick = (props: { x?: number; y?: number; payload?: { value: string } }) => {
    const { x, y, payload } = props;
    if (x == null || y == null || payload == null) return <g />;
    if (!dense && data.length > 7) {
      return (
        <text x={x} y={y + 8} textAnchor="end" fontSize={9} fill="var(--txt-dim)" transform={`rotate(-40 ${x} ${y + 8})`}>
          {payload.value}
        </text>
      );
    }
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={10.5} fill="var(--txt-dim)">
        {payload.value}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; label?: string; payload?: { dataKey: string; value: number; color: string }[] }) => {
    if (!active || !payload?.length) return null;
    const byKey = new Map(payload.map(p => [p.dataKey, p]));
    return (
      <div style={{ background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 7, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ color: 'var(--txt-mut)', marginBottom: 5 }}>{label}</div>
        {TREND_SERIES.map(s => {
          const p = byKey.get(s.key);
          if (!p) return null;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ color: s.color }}>{s.label}</span>
              <span style={{ color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace' }}>{p.value}%</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="day" tickLine={false} axisLine={false}
              tick={<XAxisTick />}
              interval={dense ? Math.ceil(data.length / 12) : 0}
              height={!dense && data.length > 7 ? 40 : 26}
            />
            <YAxis
              domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 10, fill: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}
              tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={38}
            />
            <Tooltip content={<CustomTooltip />} />
            {TREND_SERIES.map(s => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: s.color }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        {TREND_SERIES.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--txt-mut)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── donut legend (shared by Billable Split + Utilization Distribution) ─────────

function DonutLegend({ items }: { items: { label: string; valueLabel: string; pct: number; color: string }[] }) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(({ label, valueLabel, pct, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--txt-mut)' }}>{label}</span>
          </div>
          <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {valueLabel}
            <span style={{ color: 'var(--txt-dim)', marginLeft: 4, fontSize: 10 }}>({Math.round(pct)}%)</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── status pill (Healthy / Under Utilized / Over Utilized) ─────────────────────

function StatusPill({ pct }: { pct: number }) {
  const state = utilState(pct);
  const label = state === 'over' ? 'Over Utilized' : state === 'under' ? 'Under Utilized' : 'Healthy';
  const color = utilColor(pct);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20,
      fontSize: 10.5, fontWeight: 600, color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function ContributorCell({ name, hours }: { name: string; hours: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
        background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
      }}>
        {initials(name)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
        <span style={{ color: 'var(--txt-dim)', marginLeft: 4 }}>({hours.toFixed(0)}h)</span>
      </span>
    </div>
  );
}

// ── project utilization overview table (paginated) ─────────────────────────────

interface ProjectTableRow extends ProjectUtilizationRowDto {
  employees: number;
  topContributor: { name: string; hours: number } | null;
}

const PROJECT_PAGE_SIZE = 8;
const PROJECT_TABLE_COLUMNS = '1.4fr 90px 100px 90px 90px 1.3fr 130px';

function ProjectTable({ rows }: { rows: ProjectTableRow[] }) {
  const [page, setPage] = useState(0);
  const total = rows.length;
  const pages = Math.ceil(total / PROJECT_PAGE_SIZE);
  const slice = rows.slice(page * PROJECT_PAGE_SIZE, (page + 1) * PROJECT_PAGE_SIZE);

  if (rows.length === 0) {
    return <EmptyMsg>No project data in this range</EmptyMsg>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 860 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: PROJECT_TABLE_COLUMNS,
          gap: 8, padding: '6px 0 8px', borderBottom: '1px solid var(--line)',
          fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Project</span>
          <span style={{ textAlign: 'right' }}>Util %</span>
          <span style={{ textAlign: 'right' }}>Approved</span>
          <span style={{ textAlign: 'right' }}>Billable %</span>
          <span style={{ textAlign: 'right' }}>Employees</span>
          <span>Top Contributor</span>
          <span style={{ textAlign: 'center' }}>Status</span>
        </div>

        {slice.map((row, i) => (
          <div key={row.projectId} style={{
            display: 'grid', gridTemplateColumns: PROJECT_TABLE_COLUMNS,
            gap: 8, padding: '10px 6px', margin: '0 -6px',
            borderRadius: 6, borderBottom: i < slice.length - 1 ? '1px solid var(--line)' : 'none',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.projectName}
            </span>
            <span style={{ fontSize: 12, textAlign: 'right', color: utilColor(row.utilizationPct), fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(row.utilizationPct)}
            </span>
            <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
              {row.actualHours.toFixed(0)}h
            </span>
            <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(row.billablePct)}
            </span>
            <span style={{ fontSize: 12, textAlign: 'right', color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
              {row.employees}
            </span>
            {row.topContributor
              ? <ContributorCell name={row.topContributor.name} hours={row.topContributor.hours} />
              : <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>—</span>}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <StatusPill pct={row.utilizationPct} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: 'var(--txt-dim)' }}>
        <span>
          Showing {total === 0 ? 0 : page * PROJECT_PAGE_SIZE + 1} to {Math.min((page + 1) * PROJECT_PAGE_SIZE, total)} of {total} projects
        </span>
        {pages > 1 && (
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
        )}
      </div>
    </div>
  );
}

// ── employee (resource) utilization table ───────────────────────────────────────

const RESOURCE_PAGE_SIZE = 8;

function ResourceTable({ rows }: { rows: ResourceUtilizationRowDto[] }) {
  const [page, setPage] = useState(0);
  const sorted = [...rows].sort((a, b) => b.utilizationPct - a.utilizationPct);
  const total  = sorted.length;
  const pages  = Math.ceil(total / RESOURCE_PAGE_SIZE);
  const slice  = sorted.slice(page * RESOURCE_PAGE_SIZE, (page + 1) * RESOURCE_PAGE_SIZE);

  if (total === 0) {
    return <EmptyMsg>No employee data in this range</EmptyMsg>;
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

// ── top contributors panel ──────────────────────────────────────────────────────

interface ContributorAgg { employeeId: number; employeeName: string; hours: number; }

function topContributors(resourceRows: ResourceUtilizationRowDto[]): ContributorAgg[] {
  const map = new Map<number, ContributorAgg>();
  resourceRows.forEach(r => {
    const existing = map.get(r.employeeId);
    if (existing) existing.hours += r.productiveHours;
    else map.set(r.employeeId, { employeeId: r.employeeId, employeeName: r.employeeName, hours: r.productiveHours });
  });
  return [...map.values()].sort((a, b) => b.hours - a.hours).slice(0, 8);
}

function TopContributorsPanel({ resourceRows }: { resourceRows: ResourceUtilizationRowDto[] }) {
  const contributors = topContributors(resourceRows);
  const totalHours = contributors.reduce((s, c) => s + c.hours, 0);
  const maxHours = Math.max(1, ...contributors.map(c => c.hours));

  return (
    <Card>
      <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Award size={12} />Top Contributors</span></SectionLabel>
      {contributors.length === 0 ? <EmptyMsg>No approved hours in this range</EmptyMsg> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contributors.map((c, i) => {
            const pctOfTotal = totalHours > 0 ? (c.hours / totalHours) * 100 : 0;
            return (
              <div key={c.employeeId}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--txt-dim)', width: 14, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700,
                      background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
                    }}>
                      {initials(c.employeeName)}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.employeeName}
                    </span>
                  </div>
                  <span style={{ fontSize: 11.5, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)', flexShrink: 0 }}>
                    {c.hours.toFixed(0)}h <span style={{ color: 'var(--txt-dim)' }}>({Math.round(pctOfTotal)}%)</span>
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden', marginLeft: 22 }}>
                  <div style={{ width: `${(c.hours / maxHours) * 100}%`, height: '100%', background: 'var(--brand)', borderRadius: 3, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── insights panel ──────────────────────────────────────────────────────────────

interface Insight { icon: React.ComponentType<{ size?: number }>; headline: string; subtext: string; color: string; }

function buildInsights(cards: DashboardSummaryCardsDto, projectRows: ProjectUtilizationRowDto[], resourceRows: ResourceUtilizationRowDto[]): Insight[] {
  const overCount = projectRows.filter(r => utilState(r.utilizationPct) === 'over').length;
  const underCount = projectRows.filter(r => utilState(r.utilizationPct) === 'under').length;
  const lowEmpCount = resourceRows.filter(r => utilState(r.utilizationPct) === 'under').length;

  const insights: Insight[] = [];
  if (overCount > 0) {
    insights.push({
      icon: AlertTriangle, color: 'var(--risk)',
      headline: `${overCount} project${overCount > 1 ? 's are' : ' is'} over-utilized`,
      subtext: `Utilization above ${RULES.util.over}% — consider redistributing workload.`,
    });
  }
  if (underCount > 0) {
    insights.push({
      icon: TrendingDown, color: 'var(--warn)',
      headline: `${underCount} project${underCount > 1 ? 's are' : ' is'} under-utilized`,
      subtext: `Utilization below ${RULES.util.under}% — capacity may be under-allocated.`,
    });
  }
  if (cards.nonBillableUtilizationDeltaPct != null && cards.nonBillableUtilizationDeltaPct > 0.5) {
    insights.push({
      icon: Clock, color: 'var(--warn)',
      headline: `Non-billable utilization rose ${Math.abs(Math.round(cards.nonBillableUtilizationDeltaPct))} pts`,
      subtext: 'vs last month — review non-billable task allocation.',
    });
  }
  if (lowEmpCount > 0) {
    insights.push({
      icon: Users, color: 'var(--warn)',
      headline: `${lowEmpCount} employee${lowEmpCount > 1 ? 's are' : ' is'} under ${RULES.util.under}% utilization`,
      subtext: 'Across your project portfolio this period.',
    });
  }
  if (insights.length === 0) {
    insights.push({
      icon: CheckCircle2, color: 'var(--ok)',
      headline: 'All projects within healthy range',
      subtext: 'No utilization alerts for this period.',
    });
  }
  return insights.slice(0, 4);
}

function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <SectionLabel action={
        <button disabled style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', fontSize: 10.5, fontWeight: 600, cursor: 'not-allowed', padding: 0, textTransform: 'none', letterSpacing: 0 }}>
          View All Insights →
        </button>
      }>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Lightbulb size={12} />Insights</span>
      </SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {insights.map((ins, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: ins.color,
              background: `color-mix(in srgb, ${ins.color} 16%, transparent)`,
              border: `1px solid color-mix(in srgb, ${ins.color} 32%, transparent)`,
            }}>
              <ins.icon size={13} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt)' }}>{ins.headline}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>{ins.subtext}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── alerts panel ─────────────────────────────────────────────────────────────────

function AlertsPanel({ projectRows, resourceRows }: { projectRows: ProjectUtilizationRowDto[]; resourceRows: ResourceUtilizationRowDto[] }) {
  const alerts = [
    { icon: AlertTriangle, count: projectRows.filter(r => utilState(r.utilizationPct) === 'over').length, label: `project(s) over ${RULES.util.over}% utilization`, color: 'var(--risk)' },
    { icon: TrendingDown, count: projectRows.filter(r => utilState(r.utilizationPct) === 'under').length, label: `project(s) under ${RULES.util.under}% utilization`, color: 'var(--warn)' },
    { icon: Users, count: resourceRows.filter(r => utilState(r.utilizationPct) === 'under').length, label: `employee(s) under ${RULES.util.under}% utilization`, color: 'var(--warn)' },
  ].filter(a => a.count > 0);

  return (
    <Card>
      <SectionLabel action={
        <button disabled style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', fontSize: 10.5, fontWeight: 600, cursor: 'not-allowed', padding: 0, textTransform: 'none', letterSpacing: 0 }}>
          View All Alerts →
        </button>
      }>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={12} />Utilization Alerts</span>
      </SectionLabel>
      {alerts.length === 0 ? <EmptyMsg>No active alerts for this period</EmptyMsg> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color,
                background: `color-mix(in srgb, ${a.color} 16%, transparent)`,
                border: `1px solid color-mix(in srgb, ${a.color} 32%, transparent)`,
              }}>
                <a.icon size={13} />
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--txt)' }}>
                <strong style={{ fontFamily: '"JetBrains Mono", monospace' }}>{a.count}</strong> {a.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── category breakdown (with 0-100% axis scale) ─────────────────────────────────

const CATEGORY_PAGE_SIZE = 4;

function PageArrowButton({ direction, disabled, onClick }: { direction: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Previous page' : 'Next page'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, padding: 0, borderRadius: 5,
        background: 'var(--raised2)', border: '1px solid var(--line2)',
        color: disabled ? 'var(--txt-dim)' : 'var(--txt)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

function CategoryTable({ rows }: { rows: { category: string; hours: number; pctOfTotal: number }[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(rows.length / CATEGORY_PAGE_SIZE);
  const slice = rows.slice(page * CATEGORY_PAGE_SIZE, (page + 1) * CATEGORY_PAGE_SIZE);

  if (rows.length === 0) {
    return <EmptyMsg>No category data</EmptyMsg>;
  }
  return (
    <div>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>Page {page + 1} of {pages}</span>
          <PageArrowButton direction="left" disabled={page === 0} onClick={() => setPage(p => p - 1)} />
          <PageArrowButton direction="right" disabled={page === pages - 1} onClick={() => setPage(p => p + 1)} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 6 }}>
        {slice.map(row => (
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
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--line)', fontSize: 9.5, color: 'var(--txt-dim)' }}>
        {[0, 25, 50, 75, 100].map(v => <span key={v}>{v}%</span>)}
      </div>
    </div>
  );
}

// ── utilization formula panel ────────────────────────────────────────────────────

function FormulaBox({ title, sub, accent }: { title: string; sub: string; accent?: boolean }) {
  return (
    <div style={{
      flex: '1 1 180px', minWidth: 160, padding: '14px 16px', borderRadius: 8,
      background: accent ? 'color-mix(in srgb, var(--brand) 10%, var(--raised2))' : 'var(--raised2)',
      border: `1px solid ${accent ? 'color-mix(in srgb, var(--brand) 30%, var(--line2))' : 'var(--line2)'}`,
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: accent ? 'var(--brand)' : 'var(--txt)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{sub}</div>
    </div>
  );
}

function FormulaPanel() {
  return (
    <Card>
      <SectionLabel>Utilization Formula</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <FormulaBox title="Approved Productive Hours" sub="Only approved EOD hours" />
        <span style={{ fontSize: 20, color: 'var(--txt-dim)', flexShrink: 0 }}>÷</span>
        <FormulaBox title="Available Working Hours" sub="Excludes leaves, holidays & weekends" />
        <span style={{ fontSize: 20, color: 'var(--txt-dim)', flexShrink: 0 }}>=</span>
        <FormulaBox title="Utilization %" sub="(Approved / Available) × 100" accent />
      </div>
    </Card>
  );
}

// ── calendar range popover ───────────────────────────────────────────────────────

function CalendarRangePopover({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const today = todayISO();

  function openPicker() {
    setDraftFrom(from);
    setDraftTo(to);
    setOpen(true);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-label="Custom date range"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, padding: 0, background: 'var(--raised)', border: '1px solid var(--line)',
          borderRadius: 7, cursor: 'pointer', color: 'var(--txt-mut)', flexShrink: 0,
        }}
      >
        <Calendar size={14} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 240,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6 }}>From</div>
            <input
              type="date" value={draftFrom} max={draftTo} onChange={e => setDraftFrom(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6 }}>To</div>
            <input
              type="date" value={draftTo} min={draftFrom} max={today} onChange={e => setDraftTo(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box', marginBottom: 12 }}
            />
            <button
              onClick={() => { onApply(draftFrom, draftTo); setOpen(false); }}
              style={{ width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff', cursor: 'pointer' }}
            >
              Apply
            </button>
          </div>
        </>
      )}
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
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
            <Skel h={32} w={32} /><div style={{ marginTop: 12 }} />
            <Skel h={24} w="60%" /><div style={{ marginTop: 8 }} /><Skel h={11} w="45%" />
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <Skel h={14} w={160} /><div style={{ marginTop: 14 }} /><Skel h={220} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={140} /><div style={{ marginTop: 14 }} />
          {[0, 1, 2, 3].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={36} /></div>)}
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} /><div style={{ marginTop: 16 }} />
          <Skel h={130} /><div style={{ marginTop: 16 }} />
          {[0, 1].map(i => <div key={i} style={{ marginBottom: 8 }}><Skel h={14} /></div>)}
        </div>
      </div>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
        <Skel h={14} w={160} /><div style={{ marginTop: 14 }} />
        {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ marginBottom: 10 }}><Skel h={36} /></div>)}
      </div>
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function ProjectsUtilization() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const today = todayISO();
  const from  = customRange ? customRange.from : RANGES[rangeIdx].from();
  const to    = customRange ? customRange.to : today;

  const { data: filters } = useProjectDashboardFilters();

  const filterParams = useMemo<ProjectDashboardFilterParams>(() => ({
    from,
    to,
    projectId,
  }), [from, to, projectId]);

  const { data, isPending, isFetching, isError, refetch } = useProjectDashboardSummary(filterParams);
  // isPending is only true on the very first load; placeholderData keeps the previous range's
  // data on screen while a new range/project fetches, with nothing otherwise distinguishing
  // "settled" from "silently refetching" — which read as the selector not working at all when
  // a wider range's slower query hadn't finished yet. This surfaces that in-flight state.
  const isRefreshing = isFetching && !isPending;

  const fromLabel = new Date(from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const toLabel   = new Date(to + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

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

  const { cards, projectUtilization, resourceUtilization, billableSplit, taskCategoryBreakdown, utilizationTrend, plannedVsActual } = data!;

  // Employees + top contributor per project, derived client-side from resourceUtilization (joined
  // by projectName — the only key ResourceUtilizationRowDto carries — same convention CategoryTable
  // already relies on elsewhere on this page).
  const projectTableRows: ProjectTableRow[] = projectUtilization.map(p => {
    const rowsForProject = resourceUtilization.filter(r => r.projectName === p.projectName);
    const employees = new Set(rowsForProject.map(r => r.employeeId)).size;
    const top = rowsForProject.reduce<ResourceUtilizationRowDto | null>(
      (best, r) => (!best || r.productiveHours > best.productiveHours) ? r : best, null);
    return {
      ...p,
      employees,
      topContributor: top ? { name: top.employeeName, hours: top.productiveHours } : null,
    };
  });

  const overallSparkline = utilizationTrend.map(p => p.overallPct);
  const billableSparkline = utilizationTrend.map(p => p.billablePct);
  const nonBillableSparkline = utilizationTrend.map(p => p.nonBillablePct);

  const healthyCount = projectUtilization.filter(r => utilState(r.utilizationPct) === 'healthy').length;
  const underCount = projectUtilization.filter(r => utilState(r.utilizationPct) === 'under').length;
  const overCount = projectUtilization.filter(r => utilState(r.utilizationPct) === 'over').length;
  const totalProjects = projectUtilization.length;

  const totalBillableHours = billableSplit.billableHours + billableSplit.nonBillableHours;

  const insights = buildInsights(cards, projectUtilization, resourceUtilization);

  return (
    <div className="pm-util-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Projects Utilization
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Only APPROVED hours count · {fromLabel} – {toLabel}
            {isRefreshing && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--info)' }}>
                <RefreshCw size={11} className="pm-util-spin" aria-hidden="true" /> Updating…
              </span>
            )}
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

          {/* Date range tabs */}
          <div style={{ display: 'flex', gap: 0, background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 7, overflow: 'hidden' }}>
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => { setCustomRange(null); setRangeIdx(i); }}
                style={{
                  padding: '7px 14px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  background: !customRange && rangeIdx === i ? 'var(--raised2)' : 'none',
                  color: !customRange && rangeIdx === i ? 'var(--txt)' : 'var(--txt-mut)',
                  borderRight: i < RANGES.length - 1 ? '1px solid var(--line)' : 'none',
                  transition: 'color 0.14s, background 0.14s',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <CalendarRangePopover from={from} to={to} onApply={(f, t) => setCustomRange({ from: f, to: t })} />

          {/* No export pipeline exists anywhere in the app yet — presented, not wired, same
              disabled affordance as TeamUtilization's "Export Report" button. */}
          <button
            disabled
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: 'var(--txt-dim)',
              background: 'var(--raised)', border: '1px solid var(--line)', cursor: 'not-allowed', opacity: 0.6,
            }}
          >
            <Download size={13} aria-hidden="true" /> Export
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="pm-util-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        <KpiTile
          icon={<TrendingUp size={16} />}
          label="Overall Utilization"
          value={fmtPct(cards.overallUtilizationPct)}
          sub={`${plannedVsActual.plannedHours.toFixed(0)}h planned`}
          accent="var(--brand)"
          delta={cards.overallUtilizationDeltaPct}
          deltaSuffix="%"
          sparkline={overallSparkline}
        />
        <KpiTile
          icon={<Activity size={16} />}
          label="Approved Utilization"
          value={fmtPct(cards.actualUtilizationPct)}
          sub={`${plannedVsActual.actualHours.toFixed(0)}h approved`}
          accent="var(--ok)"
          delta={cards.actualUtilizationDeltaPct}
          deltaSuffix="%"
          sparkline={overallSparkline}
        />
        <KpiTile
          icon={<DollarSign size={16} />}
          label="Billable Utilization"
          value={fmtPct(cards.billableUtilizationPct)}
          sub={`${billableSplit.billableHours.toFixed(0)}h billable`}
          accent="var(--info)"
          delta={cards.billableUtilizationDeltaPct}
          sparkline={billableSparkline}
        />
        <KpiTile
          icon={<Clock size={16} />}
          label="Non-billable Utilization"
          value={fmtPct(cards.nonBillableUtilizationPct)}
          sub={`${billableSplit.nonBillableHours.toFixed(0)}h non-billable`}
          accent="var(--warn)"
          delta={cards.nonBillableUtilizationDeltaPct}
          goodDirection="down"
          sparkline={nonBillableSparkline}
        />
        <KpiTile
          icon={<FolderKanban size={16} />}
          label="Active Projects"
          value={String(cards.activeProjects)}
          sub={`${cards.totalAssignedProjects} total in portfolio`}
          accent="var(--brand)"
          delta={cards.activeProjectsDelta}
          deltaSuffix=""
        />
      </div>

      {/* Utilization Trend + Billable Split + Distribution + Insights — one row on desktop,
          Trend given a double-width column since it holds the line chart. */}
      <div className="pm-util-trend-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
        <Card>
          <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={12} />Utilization Trend</span></SectionLabel>
          <UtilizationTrendChart points={utilizationTrend} />
        </Card>

        <Card>
          <SectionLabel>Billable Split</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <SegmentDonut
              segments={[
                { label: 'Billable', value: billableSplit.billableHours, color: 'var(--ok)' },
                { label: 'Non-Billable', value: billableSplit.nonBillableHours, color: 'var(--info)' },
              ]}
              centerValue={`${totalBillableHours.toFixed(0)}h`}
              size={130}
            />
            <DonutLegend items={[
              { label: 'Billable', valueLabel: `${billableSplit.billableHours.toFixed(1)}h`, pct: totalBillableHours > 0 ? (billableSplit.billableHours / totalBillableHours) * 100 : 0, color: 'var(--ok)' },
              { label: 'Non-Billable', valueLabel: `${billableSplit.nonBillableHours.toFixed(1)}h`, pct: totalBillableHours > 0 ? (billableSplit.nonBillableHours / totalBillableHours) * 100 : 0, color: 'var(--info)' },
            ]} />
          </div>
        </Card>

        <Card>
          <SectionLabel>Utilization Distribution (by Projects)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <SegmentDonut
              segments={[
                { label: 'Healthy', value: healthyCount, color: 'var(--ok)' },
                { label: 'Under Utilized', value: underCount, color: 'var(--warn)' },
                { label: 'Over Utilized', value: overCount, color: 'var(--risk)' },
              ]}
              centerValue={String(totalProjects)}
              size={130}
            />
            <DonutLegend items={[
              { label: 'Healthy', valueLabel: String(healthyCount), pct: totalProjects > 0 ? (healthyCount / totalProjects) * 100 : 0, color: 'var(--ok)' },
              { label: 'Under Utilized', valueLabel: String(underCount), pct: totalProjects > 0 ? (underCount / totalProjects) * 100 : 0, color: 'var(--warn)' },
              { label: 'Over Utilized', valueLabel: String(overCount), pct: totalProjects > 0 ? (overCount / totalProjects) * 100 : 0, color: 'var(--risk)' },
            ]} />
          </div>
        </Card>

        <InsightsPanel insights={insights} />
      </div>

      {/* Project Utilization Overview + Top Contributors/Alerts stacked — one row on desktop,
          table given the wider column since it holds the paginated grid. */}
      <div className="pm-util-table-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <Card>
          <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Layers size={12} />Project Utilization Overview</span></SectionLabel>
          <ProjectTable rows={projectTableRows} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TopContributorsPanel resourceRows={resourceUtilization} />
          <AlertsPanel projectRows={projectUtilization} resourceRows={resourceUtilization} />
        </div>
      </div>

      {/* Employee Utilization */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Activity size={12} />Employee Utilization</span></SectionLabel>
        <ResourceTable rows={resourceUtilization} />
      </Card>

      {/* Category breakdown */}
      {taskCategoryBreakdown.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel>Utilization by Category</SectionLabel>
          <CategoryTable rows={taskCategoryBreakdown} />
        </Card>
      )}

      {/* Formula */}
      <div style={{ marginBottom: 16 }}>
        <FormulaPanel />
      </div>

      {/* Footer note */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--txt-dim)', padding: '4px 0 12px' }}>
        All hours are in decimal (h) · Utilization = Approved productive hours / Available hours × 100
      </div>

      <style>{`
        .pm-util-spin { animation: pm-util-spin 900ms linear infinite; }
        @keyframes pm-util-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .pm-util-card { transition: border-color 140ms ease, box-shadow 140ms ease; }
        .pm-util-card:hover { border-color: var(--line2); box-shadow: 0 4px 16px color-mix(in srgb, #000 10%, transparent); }
        .pm-util-kpi:hover { transform: translateY(-1px); transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease; }
        .pm-util-res-row:hover { background: var(--raised2); }

        @media (max-width: 900px) {
          .pm-util-trend-row { grid-template-columns: 1fr !important; }
          .pm-util-table-row { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .pm-util-kpis { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
