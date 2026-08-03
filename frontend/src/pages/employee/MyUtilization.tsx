import { useState } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { useUtilizationDetail } from '../../api/employee';
import type { WeekTrend, HistoryDay } from '../../api/employee';
import { UtilBar, UtilLegend } from '../../components/UtilBar';
import { RULES, utilColor, fmtPct } from '../../lib/rules';
import { todayISO, toLocalISODate } from '../../lib/date';

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
  children, style, pad = 20,
}: { children: React.ReactNode; style?: React.CSSProperties; pad?: number }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 10, padding: pad, ...style,
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
  const total = billable + nonBillable + bench;
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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 130, height: 130, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%"
              innerRadius={36} outerRadius={56}
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
      </div>
      <div style={{ flex: 1 }}>
        {[
          { label: 'Billable',     value: billable,    color: DONUT_COLORS[0] },
          { label: 'Non-Billable', value: nonBillable, color: DONUT_COLORS[1] },
          { label: 'Bench',        value: bench,        color: DONUT_COLORS[2] },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--txt-mut)' }}>{label}</span>
            </div>
            <div style={{
              fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
              color: 'var(--txt)', fontVariantNumeric: 'tabular-nums',
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
    <div>
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
          <div key={row.date} style={{
            display: 'grid', gridTemplateColumns: '130px 80px 90px 90px 90px 1fr',
            gap: 8, padding: '9px 0',
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
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 32, fontWeight: 700,
          color, letterSpacing: '-0.03em', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', marginBottom: 4,
        }}>
          {fmtPct(avgUtilPct)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Average utilization</div>
      </div>
      <UtilBar pct={avgUtilPct} />
      <div style={{
        marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 12, fontSize: 11, color: 'var(--txt-mut)',
      }}>
        {[
          { label: 'Approved hours', value: `${totalApproved.toFixed(1)}h` },
          { label: 'Available hours', value: `${totalAvailable.toFixed(1)}h` },
          { label: 'Working days',   value: `${workingDays}d` },
          { label: 'Logged days',    value: `${approvedDays}d` },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ color: 'var(--txt-dim)', marginBottom: 2 }}>{label}</div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontVariantNumeric: 'tabular-nums', color: 'var(--txt)', fontSize: 13,
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} /><div style={{ marginTop: 14 }} /><Skel h={180} />
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={100} /><div style={{ marginTop: 20 }} /><Skel h={36} w={80} />
          <div style={{ marginTop: 12 }} /><Skel h={8} /><div style={{ marginTop: 16 }} />
          {[0,1,2,3].map(i => <div key={i} style={{ marginBottom: 8 }}><Skel h={14} /></div>)}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
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
          borderRadius: 7, overflow: 'hidden',
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

      {/* Trend + current period */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <SectionLabel>Weekly Trend</SectionLabel>
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

        <Card>
          <SectionLabel>Period Summary</SectionLabel>
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
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 0 }}>
        <Card>
          <SectionLabel>Hours Breakdown</SectionLabel>
          <DonutChart
            billable={categoryBreakdown.billableHours}
            nonBillable={categoryBreakdown.nonBillableHours}
            bench={categoryBreakdown.benchHours}
          />
        </Card>

        <Card pad={0}>
          <div style={{ padding: '14px 20px 10px' }}>
            <SectionLabel>Daily History</SectionLabel>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            <HistoryTable rows={history} />
          </div>
          <UtilLegend />
        </Card>
      </div>
    </div>
  );
}
