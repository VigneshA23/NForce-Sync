import { useState } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  RefreshCw, TrendingUp, Clock, CheckCircle2, Activity, CalendarRange,
} from 'lucide-react';
import { useUtilizationDetail } from '../../api/employee';
import type { WeekTrend, HistoryDay } from '../../api/employee';
import { UtilBar, UtilLegend } from '../../components/UtilBar';
import { RULES, utilColor, utilState, fmtPct } from '../../lib/rules';
import { todayISO, toLocalISODate } from '../../lib/date';
import { totalHours } from '../../lib/hoursBreakdown';

// ── Date range helpers ─────────────────────────────────────────────────────────

function isoMinus(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  return toLocalISODate(d);
}

const RANGES = [
  { label: '4 W', from: () => isoMinus(4) },
  { label: '8 W', from: () => isoMinus(8) },
  { label: '3 M', from: () => isoMinus(13) },
];

// ── Primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({
  children, style, pad = 20, className,
}: { children: React.ReactNode; style?: React.CSSProperties; pad?: number; className?: string }) {
  return (
    <div className={className} style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 10, padding: pad, minWidth: 0, ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({
  children, icon,
}: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
    }}>
      {icon}
      {children}
    </div>
  );
}

// ── KPI summary tile ───────────────────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, accent = 'var(--txt)',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="nf-util-card nf-util-kpi" pad={16}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
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

// ── Trend chart ────────────────────────────────────────────────────────────────

function weekLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function TrendChart({ weeks }: { weeks: WeekTrend[] }) {
  const data = weeks.map(w => ({
    week: weekLabel(w.weekStart),
    util: w.avgUtilPct != null ? parseFloat(w.avgUtilPct.toFixed(1)) : null,
    approved: w.totalApproved,
  }));

  // Custom dot: hide when util is null
  const CustomDot = (props: {
    cx?: number; cy?: number; value?: number | null; r?: number;
  }) => {
    const { cx, cy, value } = props;
    if (value == null || cx == null || cy == null) return <g />;
    const color = utilColor(value);
    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--panel)" strokeWidth={2} />;
  };

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean; payload?: { value?: number | null }[]; label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const util = payload[0]?.value;
    const color = utilColor(util ?? null);
    return (
      <div style={{
        background: 'var(--raised)', border: '1px solid var(--line2)',
        borderRadius: 7, padding: '8px 12px', fontSize: 12,
      }}>
        <div style={{ color: 'var(--txt-mut)', marginBottom: 4 }}>Week of {label}</div>
        <div style={{ color, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
          {fmtPct(util ?? null)}
        </div>
      </div>
    );
  };

  if (data.every(d => d.util == null)) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--txt-dim)' }}>No approved data in this range</span>
      </div>
    );
  }

  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--info)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--info)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 10, fill: 'var(--txt-dim)', fontFamily: 'Inter, sans-serif' }}
            tickLine={false} axisLine={false}
          />
          <YAxis
            domain={[0, 120]}
            ticks={[0, 60, 100, 120]}
            tick={{ fontSize: 10, fill: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}
            tickLine={false} axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ReferenceLine y={RULES.util.under} stroke="var(--warn)"   strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={RULES.util.over}  stroke="var(--risk)"   strokeDasharray="4 4" strokeOpacity={0.6} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone" dataKey="util"
            stroke="var(--info)" strokeWidth={2}
            fill="url(#utilGrad)"
            connectNulls={false}
            dot={<CustomDot />}
            activeDot={{ r: 5, fill: 'var(--info)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Donut chart ────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['var(--ok)', 'var(--warn)', 'var(--txt-dim)'];

function DonutChart({ billable, nonBillable, bench }: {
  billable: number; nonBillable: number; bench: number;
}) {
  const total = totalHours(billable, nonBillable, bench);
  const data = [
    { name: 'Billable',     value: billable },
    { name: 'Non-Billable', value: nonBillable },
    { name: 'Bench',        value: bench },
  ].filter(d => d.value > 0);

  if (total === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data</span>
      </div>
    );
  }

  // Stacked layout (donut centered above, legend rows spanning the full card
  // width below) rather than side-by-side — the card sits in a narrow fixed
  // column, and a row layout left too little width for the legend text,
  // pushing Billable / Non-Billable / Bench past the card boundary.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, minWidth: 0 }}>
      <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%"
              innerRadius={42} outerRadius={64}
              paddingAngle={3} dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, idx) => {
                const colorIdx = ['Billable', 'Non-Billable', 'Bench'].indexOf(entry.name);
                return <Cell key={entry.name} fill={DONUT_COLORS[colorIdx < 0 ? idx : colorIdx]} />;
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 20, fontWeight: 700,
            color: 'var(--txt)', letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            {total.toFixed(1)}h
          </span>
          <span style={{ fontSize: 9, color: 'var(--txt-dim)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total
          </span>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {[
          { label: 'Billable',     value: billable,    color: DONUT_COLORS[0] },
          { label: 'Non-Billable', value: nonBillable, color: DONUT_COLORS[1] },
          { label: 'Bench',        value: bench,        color: DONUT_COLORS[2] },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{
                fontSize: 11, color: 'var(--txt-mut)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </div>
            <div style={{
              fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
              color: 'var(--txt)', fontVariantNumeric: 'tabular-nums',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {value.toFixed(1)}h
              <span style={{ color: 'var(--txt-dim)', marginLeft: 4, fontSize: 10 }}>
                ({total > 0 ? Math.round((value / total) * 100) : 0}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History table ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function HistoryTable({ rows }: { rows: HistoryDay[] }) {
  const [page, setPage] = useState(0);
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const total  = sorted.length;
  const pages  = Math.ceil(total / PAGE_SIZE);
  const slice  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--txt-dim)' }}>
        No history in this range
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 560 }}>
      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '130px 80px 90px 90px 90px 1fr',
        gap: 8, padding: '6px 0 8px',
        borderBottom: '1px solid var(--line)',
        fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <span>Date</span>
        <span style={{ textAlign: 'right' }}>Available</span>
        <span style={{ textAlign: 'right' }}>Approved</span>
        <span style={{ textAlign: 'right' }}>Billable</span>
        <span style={{ textAlign: 'right' }}>Non-Bill.</span>
        <span>Utilization</span>
      </div>

      {/* Rows */}
      {slice.map((row, i) => {
        const d = new Date(row.date + 'T12:00:00');
        const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const color = utilColor(row.utilizationPct ?? null);
        return (
          <div key={row.date} className="nf-util-hist-row" style={{
            display: 'grid', gridTemplateColumns: '130px 80px 90px 90px 90px 1fr',
            gap: 8, padding: '9px 6px',
            margin: '0 -6px',
            borderRadius: 6,
            borderBottom: i < slice.length - 1 ? '1px solid var(--line)' : 'none',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
              {label}
            </span>
            <span style={{
              fontSize: 11, textAlign: 'right', color: 'var(--txt-dim)',
              fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
            }}>
              {row.availableHours.toFixed(1)}h
            </span>
            <span style={{
              fontSize: 11, textAlign: 'right', color,
              fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
            }}>
              {row.approvedHours.toFixed(1)}h
            </span>
            <span style={{
              fontSize: 11, textAlign: 'right', color: 'var(--txt-mut)',
              fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
            }}>
              {row.billableHours.toFixed(1)}h
            </span>
            <span style={{
              fontSize: 11, textAlign: 'right', color: 'var(--txt-mut)',
              fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
            }}>
              {row.nonBillableHours.toFixed(1)}h
            </span>
            <UtilBar pct={row.utilizationPct ?? null} />
          </div>
        );
      })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 12, fontSize: 11, color: 'var(--txt-dim)',
        }}>
          <span>{total} days · page {page + 1} of {pages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {page > 0 && (
              <button
                onClick={() => setPage(p => p - 1)}
                style={{
                  padding: '4px 10px', borderRadius: 5,
                  background: 'var(--raised2)', border: '1px solid var(--line2)',
                  color: 'var(--txt)', fontSize: 11, cursor: 'pointer',
                }}
              >
                ← Prev
              </button>
            )}
            {page < pages - 1 && (
              <button
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: '4px 10px', borderRadius: 5,
                  background: 'var(--raised2)', border: '1px solid var(--line2)',
                  color: 'var(--txt)', fontSize: 11, cursor: 'pointer',
                }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Current period card ────────────────────────────────────────────────────────

function CurrentPeriodCard({
  avgUtilPct, totalApproved, totalAvailable, workingDays, approvedDays,
}: {
  avgUtilPct: number | null; totalApproved: number; totalAvailable: number;
  workingDays: number; approvedDays: number;
}) {
  const color = utilColor(avgUtilPct);
  const stateLabel: Record<string, string> = {
    na: 'No data', under: 'Under target', healthy: 'Healthy', over: 'Over target',
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 34, fontWeight: 700,
            color, letterSpacing: '-0.03em', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtPct(avgUtilPct)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '2px 8px', borderRadius: 10, color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          }}>
            {stateLabel[utilState(avgUtilPct)]}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 6 }}>Average utilization</div>
      </div>
      <UtilBar pct={avgUtilPct} />
      <div style={{
        marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)',
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        rowGap: 14, columnGap: 12, fontSize: 11, color: 'var(--txt-mut)',
      }}>
        {[
          { label: 'Approved hours', value: `${totalApproved.toFixed(1)}h` },
          { label: 'Available hours', value: `${totalAvailable.toFixed(1)}h` },
          { label: 'Working days',   value: `${workingDays}d` },
          { label: 'Logged days',    value: `${approvedDays}d` },
        ].map(({ label, value }) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--txt-dim)', marginBottom: 3 }}>{label}</div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontVariantNumeric: 'tabular-nums', color: 'var(--txt)', fontSize: 14, fontWeight: 600,
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Skel h={28} w={200} /><div style={{ marginTop: 6 }} /><Skel h={14} w={220} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
            <Skel h={32} w={32} /><div style={{ marginTop: 12 }} />
            <Skel h={24} w="60%" /><div style={{ marginTop: 8 }} />
            <Skel h={11} w="45%" />
          </div>
        ))}
      </div>
      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} /><div style={{ marginTop: 14 }} /><Skel h={180} />
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={100} /><div style={{ marginTop: 20 }} /><Skel h={36} w={80} />
          <div style={{ marginTop: 12 }} /><Skel h={8} /><div style={{ marginTop: 16 }} />
          {[0,1,2,3].map(i => <div key={i} style={{ marginBottom: 8 }}><Skel h={14} /></div>)}
        </div>
      </div>
      <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} /><div style={{ marginTop: 14 }} /><Skel h={130} />
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} /><div style={{ marginTop: 14 }} />
          {[0,1,2,3,4].map(i => <div key={i} style={{ marginBottom: 8 }}><Skel h={18} /></div>)}
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function MyUtilization() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const today = todayISO();
  const from  = RANGES[rangeIdx].from();
  const { data, isPending, isError, refetch } = useUtilizationDetail(from, today);

  if (isPending) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>
            My Utilization
          </h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 14 }}>Failed to load utilization data.</div>
          <button
            onClick={() => refetch()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'var(--raised2)',
              border: '1px solid var(--line2)', borderRadius: 6,
              color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </Card>
      </div>
    );
  }

  const { weeklyTrend, currentPeriod, categoryBreakdown, history } = data;
  const fromLabel = new Date(from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const toLabel   = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const totalCatHours = categoryBreakdown.billableHours + categoryBreakdown.nonBillableHours + categoryBreakdown.benchHours;
  const catPct = (n: number) => totalCatHours > 0 ? `${Math.round((n / totalCatHours) * 100)}% of hours` : undefined;

  return (
    <div className="nf-util-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 22, fontWeight: 700, color: 'var(--txt)',
            margin: '0 0 4px', letterSpacing: '-0.01em',
          }}>
            My Utilization
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            Only APPROVED hours count · {fromLabel} – {toLabel}
          </p>
        </div>

        {/* Range selector */}
        <div style={{
          display: 'flex', gap: 0,
          background: 'var(--raised)', border: '1px solid var(--line)',
          borderRadius: 7, overflow: 'hidden', flexShrink: 0,
        }}>
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

      {/* KPI summary row */}
      <div className="nf-util-kpis" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14, marginBottom: 16,
      }}>
        <KpiTile
          icon={<TrendingUp size={16} />}
          label="Average utilization"
          value={fmtPct(currentPeriod.avgUtilPct)}
          sub={`${currentPeriod.approvedDays}/${currentPeriod.workingDays} days logged`}
          accent={utilColor(currentPeriod.avgUtilPct)}
        />
        <KpiTile
          icon={<CheckCircle2 size={16} />}
          label="Billable hours"
          value={`${categoryBreakdown.billableHours.toFixed(1)}h`}
          sub={catPct(categoryBreakdown.billableHours)}
          accent="var(--ok)"
        />
        <KpiTile
          icon={<Clock size={16} />}
          label="Non-billable hours"
          value={`${categoryBreakdown.nonBillableHours.toFixed(1)}h`}
          sub={catPct(categoryBreakdown.nonBillableHours)}
          accent="var(--info)"
        />
        <KpiTile
          icon={<Activity size={16} />}
          label="Bench hours"
          value={`${categoryBreakdown.benchHours.toFixed(1)}h`}
          sub={catPct(categoryBreakdown.benchHours)}
          accent="var(--txt-dim)"
        />
      </div>

      {/* Trend + current period */}
      <div className="nf-util-trend-row" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 16 }}>
        <Card className="nf-util-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
            <SectionLabel icon={<TrendingUp size={13} color="var(--txt-mut)" />}>Weekly Trend</SectionLabel>
            <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--txt-dim)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 24, height: 1, borderTop: '2px dashed var(--warn)', verticalAlign: 'middle' }} />
                {RULES.util.under}%
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 24, height: 1, borderTop: '2px dashed var(--risk)', verticalAlign: 'middle' }} />
                {RULES.util.over}%
              </span>
            </div>
          </div>
          <TrendChart weeks={weeklyTrend} />
        </Card>

        <Card className="nf-util-card">
          <SectionLabel icon={<CalendarRange size={13} color="var(--txt-mut)" />}>Period Summary</SectionLabel>
          <CurrentPeriodCard
            avgUtilPct={currentPeriod.avgUtilPct}
            totalApproved={currentPeriod.totalApproved}
            totalAvailable={currentPeriod.totalAvailable}
            workingDays={currentPeriod.workingDays}
            approvedDays={currentPeriod.approvedDays}
          />
        </Card>
      </div>

      {/* Donut + history */}
      <div className="nf-util-breakdown-row" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 0 }}>
        <Card className="nf-util-card">
          <SectionLabel icon={<Activity size={13} color="var(--txt-mut)" />}>Hours Breakdown</SectionLabel>
          <DonutChart
            billable={categoryBreakdown.billableHours}
            nonBillable={categoryBreakdown.nonBillableHours}
            bench={categoryBreakdown.benchHours}
          />
        </Card>

        <Card className="nf-util-card" pad={0}>
          <div style={{ padding: '14px 20px 10px' }}>
            <SectionLabel icon={<Clock size={13} color="var(--txt-mut)" />}>Daily History</SectionLabel>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            <HistoryTable rows={history} />
          </div>
          <UtilLegend />
        </Card>
      </div>

      <style>{`
        .nf-util-card { transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease; }
        .nf-util-card:hover {
          border-color: var(--line2);
          box-shadow: 0 4px 16px color-mix(in srgb, #000 10%, transparent);
        }
        .nf-util-kpi:hover { transform: translateY(-1px); }
        .nf-util-hist-row:hover { background: var(--raised2); }

        @media (max-width: 1024px) {
          .nf-util-trend-row { grid-template-columns: 1fr !important; }
          .nf-util-breakdown-row { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .nf-util-kpis { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
