import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Clock, CheckCircle2, TrendingUp, Zap, Activity,
  ArrowRight, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useDashboardSummary } from '../../api/employee';
import type { CalendarDay, BlockedTask, RecentEntry } from '../../api/employee';
import { utilColor, fmtPct } from '../../lib/rules';

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

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Calendar cell helpers ──────────────────────────────────────────────────────

function cellTint(day: CalendarDay): string {
  if (day.isWeekend || day.isFuture || day.status === 'EMPTY') return 'var(--raised2)';
  switch (day.status) {
    case 'APPROVED': {
      const pct = day.utilizationPct ?? 0;
      if (pct >= 100) return 'color-mix(in srgb, var(--ok) 60%, var(--raised2))';
      if (pct >= 60)  return 'color-mix(in srgb, var(--ok) 35%, var(--raised2))';
      return             'color-mix(in srgb, var(--ok) 16%, var(--raised2))';
    }
    case 'SUBMITTED':         return 'color-mix(in srgb, var(--info) 28%, var(--raised2))';
    case 'DRAFT':             return 'color-mix(in srgb, var(--txt-dim) 18%, var(--raised2))';
    case 'CHANGES_REQUESTED': return 'color-mix(in srgb, var(--warn) 32%, var(--raised2))';
    case 'REJECTED':          return 'color-mix(in srgb, var(--risk) 32%, var(--raised2))';
    case 'MISSED':            return 'color-mix(in srgb, var(--risk) 50%, var(--raised2))';
    default:                  return 'var(--raised2)';
  }
}

function cellBorderColor(day: CalendarDay, isToday: boolean): string {
  if (isToday) return 'color-mix(in srgb, var(--txt) 55%, transparent)';
  if (day.status === 'SUBMITTED') return 'color-mix(in srgb, var(--info) 40%, transparent)';
  return 'transparent';
}

function cellTextColor(day: CalendarDay): string {
  if (day.isWeekend || day.isFuture || day.status === 'EMPTY') return 'var(--txt-dim)';
  if (day.status === 'APPROVED' && (day.utilizationPct ?? 0) >= 60) return 'rgba(255,255,255,0.85)';
  if (day.status === 'MISSED') return 'rgba(255,255,255,0.75)';
  return 'var(--txt-mut)';
}

function cellDotColor(day: CalendarDay): string {
  switch (day.status) {
    case 'APPROVED':          return 'rgba(255,255,255,0.45)';
    case 'SUBMITTED':         return 'var(--info)';
    case 'DRAFT':             return 'var(--txt-dim)';
    case 'MISSED':            return 'rgba(255,255,255,0.55)';
    case 'REJECTED':          return 'var(--risk)';
    case 'CHANGES_REQUESTED': return 'var(--warn)';
    default:                  return 'transparent';
  }
}

function calendarTooltip(day: CalendarDay): string {
  const d = new Date(day.date + 'T12:00:00');
  const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (day.isWeekend) return `${label} — Weekend`;
  if (day.isFuture)  return `${label} — Future`;
  if (day.status === 'EMPTY') return `${label} — No entry`;
  if (day.status === 'APPROVED') {
    return `${label} — Approved · ${fmtPct(day.utilizationPct ?? null)}`;
  }
  const labels: Record<string, string> = {
    SUBMITTED: 'Submitted (pending review)',
    DRAFT: 'Draft — not submitted',
    MISSED: 'Missed',
    REJECTED: 'Rejected — needs resubmission',
    CHANGES_REQUESTED: 'Changes requested by manager',
  };
  return `${label} — ${labels[day.status] ?? day.status}`;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    APPROVED:          { color: 'var(--ok)',       label: 'Approved' },
    SUBMITTED:         { color: 'var(--info)',      label: 'Pending' },
    DRAFT:             { color: 'var(--txt-dim)',   label: 'Draft' },
    REJECTED:          { color: 'var(--risk)',      label: 'Rejected' },
    CHANGES_REQUESTED: { color: 'var(--warn)',      label: 'Changes Requested' },
    MISSED:            { color: 'var(--risk)',      label: 'Missed' },
  };
  const { color, label } = map[status] ?? { color: 'var(--txt-dim)', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 4,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {label}
    </span>
  );
}

// ── KPI tile ───────────────────────────────────────────────────────────────────

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
    <Card>
      <div style={{ marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--raised2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: accent,
        }}>
          {icon}
        </div>
      </div>
      <div style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 26, fontWeight: 700, color: accent,
        letterSpacing: '-0.02em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums', marginBottom: 6,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

// ── Calendar heatmap (month view) ──────────────────────────────────────────────

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_PX  = 52;
const CELL_GAP = 5;

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 12px', borderRadius: 6,
    background: disabled ? 'transparent' : 'var(--raised2)',
    border: `1px solid ${disabled ? 'transparent' : 'var(--line)'}`,
    color: disabled ? 'var(--line2)' : 'var(--txt-mut)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11, fontWeight: 600, flexShrink: 0,
  };
}

function CalendarHeatmap({
  days, monthOffset, onPrev, onNext, maxOffset, todayStr,
}: {
  days: CalendarDay[];
  monthOffset: number;
  onPrev: () => void;
  onNext: () => void;
  maxOffset: number;
  todayStr: string;
}) {
  const firstDate  = days[0]?.date;
  const monthLabel = firstDate
    ? new Date(firstDate + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '';

  // leading empty cells so the first day lands on the correct weekday column (Mon=0)
  const leadingEmpties = (() => {
    if (!firstDate) return 0;
    const dow = new Date(firstDate + 'T12:00:00').getDay(); // 0=Sun
    return dow === 0 ? 6 : dow - 1;
  })();

  const gridWidth = CELL_PX * 7 + CELL_GAP * 6;
  const prevDisabled = monthOffset >= maxOffset;
  const nextDisabled = monthOffset === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', width: gridWidth, marginBottom: 16 }}>
        <button onClick={onPrev} disabled={prevDisabled} style={navBtnStyle(prevDisabled)}>
          <ChevronLeft size={13} /> Previous
        </button>
        <span style={{
          flex: 1, textAlign: 'center',
          fontSize: 14, fontWeight: 700, color: 'var(--txt)',
          fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.01em',
        }}>
          {monthLabel}
        </span>
        <button onClick={onNext} disabled={nextDisabled} style={navBtnStyle(nextDisabled)}>
          Next <ChevronRight size={13} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(7, ${CELL_PX}px)`,
        gap: CELL_GAP, marginBottom: CELL_GAP, width: gridWidth,
      }}>
        {DAY_HEADERS.map(d => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 9, color: 'var(--txt-dim)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(7, ${CELL_PX}px)`,
        gap: CELL_GAP, width: gridWidth,
      }}>
        {/* Leading empty cells for weekday offset */}
        {Array.from({ length: leadingEmpties }).map((_, i) => (
          <div key={`pad-${i}`} style={{ width: CELL_PX, height: CELL_PX }} />
        ))}

        {/* Day cells */}
        {days.map((day) => {
          const isToday = day.date === todayStr;
          const dayNum  = new Date(day.date + 'T12:00:00').getDate();
          const showDot = !day.isWeekend && !day.isFuture && day.status !== 'EMPTY';
          return (
            <div
              key={day.date}
              title={calendarTooltip(day)}
              style={{
                width: CELL_PX, height: CELL_PX,
                borderRadius: 7,
                background: cellTint(day),
                border: `1.5px solid ${cellBorderColor(day, isToday)}`,
                boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 3, cursor: 'default',
                transition: 'filter 0.1s',
                boxShadow: isToday
                  ? '0 0 0 2px color-mix(in srgb, var(--txt) 20%, transparent)'
                  : undefined,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter = ''; }}
            >
              <span style={{
                fontSize: 13, fontWeight: 600, lineHeight: 1,
                color: cellTextColor(day), fontVariantNumeric: 'tabular-nums',
              }}>
                {dayNum}
              </span>
              {showDot && (
                <span style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: cellDotColor(day), flexShrink: 0,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap',
        fontSize: 9, color: 'var(--txt-dim)', width: gridWidth,
      }}>
        {[
          { bg: 'color-mix(in srgb, var(--ok) 60%, var(--raised2))',   label: 'Healthy ≥100%' },
          { bg: 'color-mix(in srgb, var(--ok) 35%, var(--raised2))',   label: 'On track 60–99%' },
          { bg: 'color-mix(in srgb, var(--ok) 16%, var(--raised2))',   label: 'Under <60%' },
          { bg: 'color-mix(in srgb, var(--risk) 50%, var(--raised2))', label: 'Missed' },
          { bg: 'color-mix(in srgb, var(--warn) 32%, var(--raised2))', label: 'CR / Rejected' },
          { bg: 'color-mix(in srgb, var(--info) 28%, var(--raised2))', label: 'Pending' },
          { bg: 'var(--raised2)', label: 'No entry', border: '1px solid var(--line)' },
        ].map(({ bg, label, border }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 9, height: 9, borderRadius: 2, flexShrink: 0,
              background: bg, border: border ?? 'none', boxSizing: 'border-box',
            }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Month Stats panel (inline — no Card wrapper) ───────────────────────────────

function MonthStatsPanel({ days }: { days: CalendarDay[] }) {
  const workingDays  = days.filter(d => !d.isWeekend).length;
  const pastDays     = days.filter(d => !d.isWeekend && !d.isFuture).length;
  const approved     = days.filter(d => d.status === 'APPROVED').length;
  const submitted    = days.filter(d => d.status === 'SUBMITTED').length;
  const missed       = days.filter(d => d.status === 'MISSED').length;
  const needsAction  = days.filter(d => d.status === 'REJECTED' || d.status === 'CHANGES_REQUESTED').length;
  const empty        = days.filter(d => !d.isWeekend && !d.isFuture && d.status === 'EMPTY').length;
  const upcoming     = days.filter(d => !d.isWeekend && d.isFuture).length;
  const completePct  = pastDays > 0 ? Math.round((approved + submitted) / pastDays * 100) : 0;
  const barPct = (n: number) => workingDays > 0 ? `${(n / workingDays * 100).toFixed(1)}%` : '0%';

  return (
    <div>
      <SectionLabel>Month Overview</SectionLabel>

      {/* Completion % */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{
          fontSize: 28, fontWeight: 700, color: 'var(--txt)',
          fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em',
        }}>
          {completePct}%
        </span>
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
          {approved + submitted} / {pastDays} days
        </span>
      </div>

      {/* Segmented bar */}
      <div style={{
        height: 6, borderRadius: 3, background: 'var(--raised2)',
        overflow: 'hidden', display: 'flex', marginBottom: 20,
      }}>
        <div style={{ width: barPct(approved),    background: 'var(--ok)',   transition: 'width 0.4s' }} />
        <div style={{ width: barPct(submitted),   background: 'var(--info)', transition: 'width 0.4s' }} />
        <div style={{ width: barPct(needsAction), background: 'var(--warn)', transition: 'width 0.4s' }} />
        <div style={{ width: barPct(missed),      background: 'var(--risk)', transition: 'width 0.4s' }} />
      </div>

      {/* Breakdown rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {([
          { color: 'var(--ok)',      count: approved,    label: 'Approved' },
          { color: 'var(--info)',    count: submitted,   label: 'Pending review' },
          { color: 'var(--warn)',    count: needsAction, label: 'Needs action' },
          { color: 'var(--risk)',    count: missed,      label: 'Missed' },
          { color: 'var(--txt-dim)', count: empty,       label: 'Not submitted' },
          { color: 'var(--line2)',   count: upcoming,    label: 'Upcoming' },
        ] as { color: string; count: number; label: string }[]).map(({ color, count, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>{label}</span>
            <span style={{
              fontSize: 12, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
              color: count === 0 ? 'var(--txt-dim)' : 'var(--txt)', fontWeight: count > 0 ? 600 : 400,
              minWidth: 28, textAlign: 'right',
            }}>
              {count}d
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action Required ────────────────────────────────────────────────────────────

function ActionRequired({ entries }: { entries: RecentEntry[] }) {
  const items = entries.filter(e =>
    e.status === 'REJECTED' || e.status === 'CHANGES_REQUESTED' || e.status === 'MISSED'
  );
  if (items.length === 0) return null;

  return (
    <Card pad={0}>
      <div style={{
        padding: '12px 16px 8px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertCircle size={13} color="var(--warn)" style={{ flexShrink: 0 }} />
        <SectionLabel style={{ marginBottom: 0, color: 'var(--warn)' }}>Needs Attention</SectionLabel>
        <span style={{
          marginLeft: 'auto',
          fontSize: 10, fontWeight: 700,
          padding: '1px 7px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--warn) 15%, transparent)',
          color: 'var(--warn)',
        }}>
          {items.length}
        </span>
      </div>
      {items.slice(0, 3).map(entry => {
        const d = new Date(entry.date + 'T12:00:00');
        const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const isCR = entry.status === 'CHANGES_REQUESTED';
        const statusColor = entry.status === 'MISSED' ? 'var(--risk)' : isCR ? 'var(--warn)' : 'var(--risk)';
        const statusText  = isCR ? 'Changes Req.' : entry.status === 'REJECTED' ? 'Rejected' : 'Missed';
        return (
          <div key={entry.id} style={{
            padding: '9px 16px', borderTop: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', marginBottom: 2 }}>
                {dateLabel}
              </div>
              <div style={{ fontSize: 10, color: statusColor, fontWeight: 700 }}>{statusText}</div>
            </div>
            {entry.status !== 'MISSED' && (
              <a href="/eod/history" style={{
                fontSize: 10, fontWeight: 600, color: 'var(--info)',
                textDecoration: 'none', padding: '3px 10px', whiteSpace: 'nowrap',
                background: 'color-mix(in srgb, var(--info) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)',
                borderRadius: 5,
              }}>
                Fix →
              </a>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ── Cutoff banner ──────────────────────────────────────────────────────────────

function CutoffBanner({
  status, cutoffPassed, cutoffTime,
}: { status: string | null; cutoffPassed: boolean; cutoffTime: string }) {
  const needsAction = !status || status === 'DRAFT' || status === 'CHANGES_REQUESTED' || status === 'REJECTED';
  if (!needsAction) return null;

  const [h, m] = cutoffTime.split(':');
  const fmt = `${parseInt(h)}:${m}`;

  if (cutoffPassed) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', marginBottom: 20,
        background: 'color-mix(in srgb, var(--risk) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--risk) 25%, transparent)',
        borderRadius: 8,
      }}>
        <AlertCircle size={16} color="var(--risk)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--risk)' }}>
            {status === 'CHANGES_REQUESTED' ? "Changes requested — cutoff passed." : "Cutoff passed — EOD not submitted."}
          </span>
          <span style={{ fontSize: 12, color: 'var(--txt-mut)', marginLeft: 8 }}>
            This day may be marked as missed.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px', marginBottom: 20,
      background: 'color-mix(in srgb, var(--warn) 8%, transparent)',
      border: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)',
      borderRadius: 8,
    }}>
      <Clock size={16} color="var(--warn)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>
          {status === 'CHANGES_REQUESTED'
            ? "Your manager requested changes."
            : status === 'DRAFT'
            ? "Draft saved — remember to submit."
            : "Today's EOD not yet submitted."}
        </span>
        <span style={{ fontSize: 12, color: 'var(--txt-mut)', marginLeft: 8 }}>
          Cutoff at {fmt}.
        </span>
      </div>
      <a
        href="/eod/submit"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 6,
          background: 'var(--warn)', color: '#000',
          fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
        }}
      >
        Submit <ArrowRight size={12} />
      </a>
    </div>
  );
}

// ── Blocked tasks panel ────────────────────────────────────────────────────────

function BlockersPanel({ tasks }: { tasks: BlockedTask[] }) {
  if (tasks.length === 0) {
    return (
      <Card>
        <SectionLabel>My Blockers</SectionLabel>
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--txt-dim)' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--ok)', display: 'block', margin: '0 auto 8px' }} />
          No active blockers
        </div>
      </Card>
    );
  }

  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px 8px' }}>
        <SectionLabel>My Blockers</SectionLabel>
      </div>
      {tasks.map((t, i) => {
        const d = new Date(t.entryDate + 'T12:00:00');
        const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return (
          <div key={`${t.entryId}-${i}`} style={{
            padding: '9px 16px', borderTop: '1px solid var(--line)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: 3,
              background: 'var(--risk)', marginTop: 5, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--txt)', lineHeight: 1.4, marginBottom: 3 }}>
                {t.description}
              </div>
              {t.blockerReason && (
                <div style={{ fontSize: 10, color: 'var(--txt-mut)', fontStyle: 'italic', lineHeight: 1.4, marginBottom: 3 }}>
                  {t.blockerReason}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--txt-dim)' }}>
                <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--raised2)', color: 'var(--txt-mut)' }}>
                  {t.projectName}
                </span>
                <span>{dateLabel}</span>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── Recent activity strip ──────────────────────────────────────────────────────

function RecentActivity({ entries }: { entries: RecentEntry[] }) {
  const navigate = useNavigate();
  const display = entries.slice(0, 5);

  return (
    <Card pad={0}>
      <div style={{
        padding: '14px 16px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <SectionLabel>Recent Entries</SectionLabel>
        <button
          onClick={() => navigate('/eod/history')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--info)', fontSize: 11, fontWeight: 500,
            padding: '2px 4px', borderRadius: 4,
          }}
        >
          View all <ArrowRight size={11} />
        </button>
      </div>

      {display.length === 0 ? (
        <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--txt-dim)', textAlign: 'center' }}>
          No recent entries
        </div>
      ) : (
        display.map((entry) => {
          const d = new Date(entry.date + 'T12:00:00');
          const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const utilAccent = utilColor(entry.utilizationPct ?? null);
          return (
            <div key={entry.id} style={{
              padding: '10px 16px', borderTop: '1px solid var(--line)',
              display: 'grid', gridTemplateColumns: '150px 1fr auto auto',
              gap: 12, alignItems: 'center',
            }}>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
                {dateLabel}
              </div>
              <StatusBadge status={entry.status} />
              {entry.status === 'APPROVED'
                ? <span style={{ fontSize: 11, color: utilAccent, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtPct(entry.utilizationPct ?? null)}
                  </span>
                : <span />
              }
              <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                {entry.totalHours.toFixed(1)}h
              </span>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Skel h={28} w={200} />
        <div style={{ marginTop: 6 }}><Skel h={14} w={280} /></div>
      </div>
      <Skel h={48} />
      <div style={{ height: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
            <Skel h={36} w={36} /><div style={{ marginTop: 12 }} />
            <Skel h={28} w="55%" /><div style={{ marginTop: 8 }} />
            <Skel h={12} w="45%" />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={32} w={200} />
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(7, 44px)', gap: 5 }}>
            {Array.from({ length: 35 }).map((_, i) => <Skel key={i} h={44} />)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
              <Skel h={14} w={100} /><div style={{ marginTop: 12 }} /><Skel h={48} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

const MAX_MONTH_OFFSET = 12;

export default function Dashboard() {
  const navigate = useNavigate();
  const [monthOffset, setMonthOffset] = useState(0);

  // Compute first and last day of the displayed month
  const { calendarFrom, calendarTo } = useMemo(() => {
    const now  = new Date();
    const ref  = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const from = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-01`;
    const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const to   = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    return { calendarFrom: monthOffset === 0 ? undefined : from, calendarTo: monthOffset === 0 ? undefined : to };
  }, [monthOffset]);

  const { data, isPending, isError, refetch } = useDashboardSummary(calendarFrom, calendarTo);

  if (isPending) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>
            My Dashboard
          </h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <AlertCircle size={32} color="var(--risk)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: 14 }}>Failed to load dashboard.</div>
          <button
            onClick={() => refetch()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: 'var(--raised2)',
              border: '1px solid var(--line2)', borderRadius: 6,
              color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const { cutoffStatus, quickStats, blockedTasks, recentEntries, calendarData } = data;

  const today      = new Date(cutoffStatus.today + 'T12:00:00');
  const todayLabel = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const isWeekend  = today.getDay() === 0 || today.getDay() === 6;

  const streakLabel = quickStats.streak === 0
    ? 'No streak'
    : `${quickStats.streak} day${quickStats.streak === 1 ? '' : 's'}`;

  const dsiLabel = quickStats.daysSinceLastIssue < 0
    ? 'No issues'
    : quickStats.daysSinceLastIssue === 0 ? 'Today'
    : `${quickStats.daysSinceLastIssue}d ago`;

  const monthAvgColor = utilColor(quickStats.monthAvgUtil ?? null);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 22, fontWeight: 700, color: 'var(--txt)',
          margin: '0 0 4px', letterSpacing: '-0.01em',
        }}>
          My Dashboard
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>{todayLabel}</p>
      </div>

      {/* Cutoff banner */}
      {!isWeekend && (
        <CutoffBanner
          status={cutoffStatus.entryStatus}
          cutoffPassed={cutoffStatus.cutoffPassed}
          cutoffTime={cutoffStatus.cutoffTime}
        />
      )}

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <KpiTile
          icon={<Clock size={18} />}
          label="This week approved"
          value={`${quickStats.weekApprovedHours.toFixed(1)}h`}
          accent="var(--info)"
        />
        <KpiTile
          icon={<TrendingUp size={18} />}
          label="Month avg utilization"
          value={fmtPct(quickStats.monthAvgUtil)}
          accent={monthAvgColor}
        />
        <KpiTile
          icon={<Zap size={18} />}
          label="Approved streak"
          value={streakLabel}
          sub={quickStats.streak >= 5 ? '🔥 On a roll' : undefined}
          accent={quickStats.streak >= 5 ? 'var(--ok)' : quickStats.streak > 0 ? 'var(--info)' : 'var(--txt-dim)'}
        />
        <KpiTile
          icon={<Activity size={18} />}
          label="Last issue"
          value={dsiLabel}
          sub={quickStats.daysSinceLastIssue < 0 ? 'in past 90 days' : undefined}
          accent={
            quickStats.daysSinceLastIssue < 0 || quickStats.daysSinceLastIssue > 7 ? 'var(--ok)'
            : quickStats.daysSinceLastIssue <= 2 ? 'var(--risk)' : 'var(--warn)'
          }
        />
      </div>

      {/* Calendar card + Right panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
        {/* Single card: calendar left + stats right */}
        <Card>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <SectionLabel style={{ marginBottom: 0 }}>Monthly Activity</SectionLabel>
            <button
              onClick={() => navigate('/utilization')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--info)', fontSize: 11, fontWeight: 500,
                padding: '2px 4px', borderRadius: 4,
              }}
            >
              Full report <ArrowRight size={11} />
            </button>
          </div>

          {/* Body: calendar | divider | month stats */}
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
            {/* Calendar */}
            <div style={{ flexShrink: 0 }}>
              <CalendarHeatmap
                days={calendarData}
                monthOffset={monthOffset}
                onPrev={() => setMonthOffset(o => Math.min(o + 1, MAX_MONTH_OFFSET))}
                onNext={() => setMonthOffset(o => Math.max(o - 1, 0))}
                maxOffset={MAX_MONTH_OFFSET}
                todayStr={cutoffStatus.today}
              />
            </div>

            {/* Vertical divider */}
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', flexShrink: 0 }} />

            {/* Month stats */}
            <div style={{ flex: 1, paddingTop: 4 }}>
              <MonthStatsPanel days={calendarData} />
            </div>
          </div>
        </Card>

        {/* Right: Needs Attention + Blockers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ActionRequired entries={recentEntries} />
          <BlockersPanel tasks={blockedTasks} />
        </div>
      </div>

      {/* Recent entries */}
      <RecentActivity entries={recentEntries} />
    </div>
  );
}
