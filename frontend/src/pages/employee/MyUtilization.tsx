import { useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  RefreshCw, TrendingUp, Clock, CheckCircle2, Activity, CalendarRange,
} from 'lucide-react';
import { useUtilizationDetail } from '../../api/employee';
import type { WeekTrend, HistoryDay } from '../../api/employee';
import { UtilBar, UtilLegend } from '../../components/UtilBar';
import { GlobalLoader } from '../../components/GlobalLoader';
import { RULES, utilColor, utilState, fmtPct } from '../../lib/rules';
import { todayISO, toLocalISODate } from '../../lib/date';
import { useHashScroll } from '../../lib/useHashScroll';

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
  children, icon, id,
}: { children: React.ReactNode; icon?: React.ReactNode; id?: string }) {
  return (
    <div id={id} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      scrollMarginTop: 72,
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
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--panel)',
        border: `1px solid ${hov ? `color-mix(in srgb, ${accent} 45%, var(--line))` : 'var(--line)'}`,
        borderRadius: 12,
        padding: '16px 18px',
        position: 'relative',
        overflow: 'hidden',
        transform: hov ? 'translateY(-3px) scale(1.01)' : 'translateY(0) scale(1)',
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.18s ease, box-shadow 0.18s ease',
        boxShadow: hov
          ? `0 8px 24px -4px color-mix(in srgb, ${accent} 25%, transparent), 0 2px 8px color-mix(in srgb, ${accent} 10%, transparent)`
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'default',
        minWidth: 0,
      }}
    >
      <div aria-hidden="true" style={{
        position: 'absolute', top: -16, right: -16, width: 72, height: 72, borderRadius: '50%',
        background: `radial-gradient(circle, color-mix(in srgb, ${accent} 28%, transparent), transparent 70%)`,
        opacity: hov ? 1 : 0.5, transition: 'opacity 0.25s ease', pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${accent} 50%, transparent) 50%, transparent)`,
        opacity: hov ? 0.6 : 0, transition: 'opacity 0.25s ease',
        borderRadius: '12px 12px 0 0', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `color-mix(in srgb, ${accent} 14%, var(--raised2, transparent))`,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)${hov ? `, 0 0 12px color-mix(in srgb, ${accent} 30%, transparent)` : ''}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
          transform: hov ? 'scale(1.12)' : 'scale(1)',
        }}>
          {icon}
        </div>
      </div>

      <div style={{
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
        fontSize: 24, fontWeight: 700, color: accent,
        letterSpacing: '-0.02em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', marginBottom: 5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--txt-mut)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', marginTop: 3 }}>{sub}</div>}
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

  // Custom dot: hollow gray circle for missing weeks, solid colored dot for real data
  const CustomDot = (props: {
    cx?: number; cy?: number; value?: number | null; r?: number;
  }) => {
    const { cx, cy, value } = props;
    if (cx == null || cy == null) return <g />;
    if (value == null) {
      return <circle cx={cx} cy={cy} r={3} fill="var(--panel)" stroke="var(--txt-dim)" strokeWidth={1.5} opacity={0.5} />;
    }
    const color = utilColor(value);
    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--panel)" strokeWidth={2} />;
  };

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean; payload?: { value?: number | null }[]; label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const util = payload[0]?.value;
    const color = util != null ? utilColor(util) : 'var(--txt-dim)';
    return (
      <div style={{
        background: 'var(--raised)', border: '1px solid var(--line2)',
        borderRadius: 7, padding: '8px 12px', fontSize: 12,
      }}>
        <div style={{ color: 'var(--txt-mut)', marginBottom: 4 }}>Week of {label}</div>
        <div style={{ color, fontWeight: 600 }}>
          {util != null ? fmtPct(util) : 'No data this week'}
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
            tick={{ fontSize: 10, fill: 'var(--txt-dim)' }}
            tickLine={false} axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ReferenceLine y={RULES.util.under} stroke="var(--warn)"   strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={RULES.util.over}  stroke="var(--risk)"   strokeDasharray="4 4" strokeOpacity={0.6} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="util"
            stroke="var(--line2)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            connectNulls={true}
            dot={false}
            activeDot={false}
          />
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
        display: 'grid', gridTemplateColumns: '130px 80px 90px 1fr',
        gap: 8, padding: '6px 0 8px',
        borderBottom: '1px solid var(--line)',
        fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <span>Date</span>
        <span style={{ textAlign: 'right' }}>Available</span>
        <span style={{ textAlign: 'right' }}>Approved</span>
        <span>Utilization</span>
      </div>

      {/* Rows */}
      {slice.map((row, i) => {
        const d = new Date(row.date + 'T12:00:00');
        const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const color = utilColor(row.utilizationPct ?? null);
        return (
          <div key={row.date} className="nf-util-hist-row" style={{
            display: 'grid', gridTemplateColumns: '130px 80px 90px 1fr',
            gap: 8, padding: '9px 6px',
            margin: '0 -6px',
            borderRadius: 6,
            borderBottom: i < slice.length - 1 ? '1px solid var(--line)' : 'none',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>
              {label}
            </span>
            <span style={{
              fontSize: 11, textAlign: 'right', color: 'var(--txt-dim)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {row.availableHours.toFixed(1)}h
            </span>
            <span style={{
              fontSize: 11, textAlign: 'right', color,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {row.approvedHours.toFixed(1)}h
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
            fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
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


// ── Main ───────────────────────────────────────────────────────────────────────

export default function MyUtilization() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const today = todayISO();
  const from  = RANGES[rangeIdx].from();
  const { data, isPending, isError, refetch } = useUtilizationDetail(from, today);
  useHashScroll(!isPending);

  if (isPending) return <GlobalLoader fullScreen={false} />;

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>
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

  const totalCatHours = categoryBreakdown.productiveHours + categoryBreakdown.benchHours;
  const catPct = (n: number) => totalCatHours > 0 ? `${Math.round((n / totalCatHours) * 100)}% of hours` : undefined;

  return (
    <div className="nf-util-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{
            fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
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
          label="Productive hours"
          value={`${categoryBreakdown.productiveHours.toFixed(1)}h`}
          sub={catPct(categoryBreakdown.productiveHours)}
          accent="var(--ok)"
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
            <SectionLabel id="weekly-trend" icon={<TrendingUp size={13} color="var(--txt-mut)" />}>Weekly Trend</SectionLabel>
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
          <SectionLabel id="period-summary" icon={<CalendarRange size={13} color="var(--txt-mut)" />}>Period Summary</SectionLabel>
          <CurrentPeriodCard
            avgUtilPct={currentPeriod.avgUtilPct}
            totalApproved={currentPeriod.totalApproved}
            totalAvailable={currentPeriod.totalAvailable}
            workingDays={currentPeriod.workingDays}
            approvedDays={currentPeriod.approvedDays}
          />
        </Card>
      </div>

      {/* Daily History — full width */}
      <Card className="nf-util-card" pad={0}>
        <div style={{ padding: '14px 20px 10px' }}>
          <SectionLabel id="daily-history" icon={<Clock size={13} color="var(--txt-mut)" />}>Daily History</SectionLabel>
        </div>
        <div style={{ padding: '0 20px 16px' }}>
          <HistoryTable rows={history} />
        </div>
        <UtilLegend />
      </Card>

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
        }
        @media (max-width: 560px) {
          .nf-util-kpis { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
