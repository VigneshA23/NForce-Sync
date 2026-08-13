import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, Clock, CheckCircle2, TrendingUp, Zap, Activity,
  ArrowRight, ChevronLeft, ChevronRight, CalendarDays, FolderKanban,
  MessageSquare, CalendarX,
} from 'lucide-react';
import {
  useDashboardSummary, useEmployeeDashboardStats, useEmployeeProjects,
  useHolidaysForYear, useUtilizationDetail,
} from '../../api/employee';
import type {
  CalendarDay, BlockedTask, RecentEntry, PendingCorrectionDto, EmployeeProjectDto, HolidayDto,
} from '../../api/employee';
import { useAuth } from '../../lib/auth';
import { UtilPctDonut, CategoryDonut, SegmentDonut } from '../../components/UtilizationDonut';
import { utilColor, fmtPct } from '../../lib/rules';
import { formatDate, formatDateTime, formatTime12h, toLocalISODate, todayISO } from '../../lib/date';

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
  const needsAction  = days.filter(d => d.status === 'REJECTED').length;
  const empty        = days.filter(d => !d.isWeekend && !d.isFuture && d.status === 'EMPTY').length;
  const upcoming     = days.filter(d => !d.isWeekend && d.isFuture).length;
  const completePct  = pastDays > 0 ? Math.round((approved + submitted) / pastDays * 100) : 0;

  return (
    <div>
      <SectionLabel>Month Overview</SectionLabel>

      {/* Completion donut + total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <SegmentDonut
          size={76}
          centerValue={`${completePct}%`}
          segments={[
            { label: 'Approved',     value: approved,    color: 'var(--ok)' },
            { label: 'Pending',      value: submitted,   color: 'var(--info)' },
            { label: 'Needs action', value: needsAction, color: 'var(--warn)' },
            { label: 'Missed',       value: missed,       color: 'var(--risk)' },
          ]}
        />
        <div>
          <div style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600 }}>
            {approved + submitted} / {pastDays} days complete
          </div>
          <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>
            {workingDays} working days this month
          </div>
        </div>
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

// ── Pending Corrections ─────────────────────────────────────────────────────────
// Replaces the old recentEntries-derived "Needs Attention" strip: sources the
// dedicated dashboard-stats endpoint (30-day lookback, includes the reviewer's
// actual comment) instead of scanning the 10-entry recent-activity list.

function PendingCorrectionsPanel({ corrections }: { corrections: PendingCorrectionDto[] }) {
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <MessageSquare size={13} color="var(--warn)" style={{ flexShrink: 0 }} />
        <SectionLabel style={{ marginBottom: 0, color: corrections.length ? 'var(--warn)' : 'var(--txt-dim)' }}>
          Pending Corrections
        </SectionLabel>
        {corrections.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700,
            padding: '1px 7px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--warn) 15%, transparent)',
            color: 'var(--warn)',
          }}>
            {corrections.length}
          </span>
        )}
      </div>
      {corrections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 20px', fontSize: 12, color: 'var(--txt-dim)' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--ok)', display: 'block', margin: '0 auto 8px' }} />
          Nothing needs correction
        </div>
      ) : (
        corrections.slice(0, 4).map(c => {
          return (
            <div key={c.entryId} style={{
              padding: '9px 16px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
                    {formatDate(c.entryDate)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk)' }}>
                    Rejected
                  </span>
                </div>
                {c.reviewerComment && (
                  <div style={{ fontSize: 11, color: 'var(--txt-mut)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    "{c.reviewerComment}"
                  </div>
                )}
              </div>
              <Link to={`/eod/submit?date=${c.entryDate}`} style={{
                fontSize: 10, fontWeight: 600, color: 'var(--info)',
                textDecoration: 'none', padding: '3px 10px', whiteSpace: 'nowrap',
                background: 'color-mix(in srgb, var(--info) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)',
                borderRadius: 5, flexShrink: 0,
              }}>
                Resubmit →
              </Link>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ── Missed Submissions ──────────────────────────────────────────────────────────

function MissedSubmissionsPanel({ dates, count }: { dates: string[]; count: number }) {
  const severity = count === 0 ? 'ok' : count <= 2 ? 'warn' : 'risk';
  const severityColor = severity === 'ok' ? 'var(--ok)' : severity === 'warn' ? 'var(--warn)' : 'var(--risk)';
  const shown = dates.slice(0, 4);

  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarX size={13} color={severityColor} style={{ flexShrink: 0 }} />
        <SectionLabel style={{ marginBottom: 0, color: count ? severityColor : 'var(--txt-dim)' }}>
          Missed Submissions
        </SectionLabel>
        {count > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700,
            padding: '1px 7px', borderRadius: 10,
            background: `color-mix(in srgb, ${severityColor} 15%, transparent)`,
            color: severityColor,
          }}>
            {count}
          </span>
        )}
      </div>
      {count === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 20px', fontSize: 12, color: 'var(--txt-dim)' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--ok)', display: 'block', margin: '0 auto 8px' }} />
          No missed days this month
        </div>
      ) : (
        <>
          {shown.map(date => (
            <div key={date} style={{
              padding: '9px 16px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
                {formatDate(date)}
              </span>
              <Link to={`/eod/submit?date=${date}`} style={{
                fontSize: 10, fontWeight: 600, color: 'var(--info)',
                textDecoration: 'none', padding: '3px 10px', whiteSpace: 'nowrap',
                background: 'color-mix(in srgb, var(--info) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)',
                borderRadius: 5,
              }}>
                Submit →
              </Link>
            </div>
          ))}
          {count > shown.length && (
            <div style={{ padding: '7px 16px 10px', fontSize: 11, color: 'var(--txt-dim)', borderTop: '1px solid var(--line)' }}>
              +{count - shown.length} more this month
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Assigned Projects ────────────────────────────────────────────────────────────

function projectStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':    return 'var(--ok)';
    case 'COMPLETED': return 'var(--txt-dim)';
    case 'ON_HOLD':   return 'var(--warn)';
    case 'CANCELLED': return 'var(--risk)';
    default:          return 'var(--txt-mut)';
  }
}

function AssignedProjectsPanel({ projects }: { projects: EmployeeProjectDto[] }) {
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FolderKanban size={13} color="var(--txt-mut)" style={{ flexShrink: 0 }} />
        <SectionLabel style={{ marginBottom: 0 }}>Assigned Projects</SectionLabel>
        {projects.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
            {projects.length}
          </span>
        )}
      </div>
      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 20px', fontSize: 12, color: 'var(--txt-dim)' }}>
          No active project assignments
        </div>
      ) : (
        projects.map(p => (
          <div key={p.projectId} style={{
            padding: '9px 16px', borderTop: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 500, marginBottom: 2 }}>
                {p.projectName}
                <span style={{ fontSize: 10, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', marginLeft: 6 }}>
                  {p.projectCode}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>
                {p.pmName ? `Team Lead: ${p.pmName} · ` : ''}
                {formatDate(p.assignedFrom)} – {p.assignedTo ? formatDate(p.assignedTo) : 'Ongoing'}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '2px 7px', borderRadius: 4, flexShrink: 0,
              color: projectStatusColor(p.projectStatus),
              background: `color-mix(in srgb, ${projectStatusColor(p.projectStatus)} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${projectStatusColor(p.projectStatus)} 30%, transparent)`,
            }}>
              {p.projectStatus}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

// ── Holidays ─────────────────────────────────────────────────────────────────────
// No leave-request/leave-balance module exists in the backend yet — only company
// holidays are backed by a real endpoint. Weekend visibility already lives on the
// monthly calendar heatmap above, so this panel doesn't repeat it.

function HolidaysPanel({ holidays, year }: { holidays: HolidayDto[]; year: number }) {
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={13} color="var(--txt-mut)" style={{ flexShrink: 0 }} />
        <SectionLabel style={{ marginBottom: 0 }}>Holiday Calendar &mdash; {year}</SectionLabel>
        {holidays.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
            {holidays.length}
          </span>
        )}
      </div>
      {holidays.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 20px', fontSize: 12, color: 'var(--txt-dim)' }}>
          No holidays configured for {year}
        </div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {holidays.map(h => {
            const d = new Date(h.holidayDate + 'T12:00:00');
            const dayOfWeek = d.toLocaleDateString('en-GB', { weekday: 'short' });
            return (
              <div key={h.id} style={{
                padding: '9px 16px', borderTop: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--txt)' }}>{h.name}</span>
                <span style={{ fontSize: 10, color: 'var(--txt-dim)' }}>{dayOfWeek}</span>
                <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
                  {formatDate(h.holidayDate)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--txt-dim)', borderTop: '1px solid var(--line)' }}>
        Weekends are shown on the monthly calendar above.
      </div>
    </Card>
  );
}

// ── Weekly / Monthly Utilization cards ──────────────────────────────────────────

function UtilPeriodCard({
  title, avgUtilPct, approvedHours, availableHours, billableHours, nonBillableHours, benchHours, breakdown, onViewFull,
}: {
  title: string;
  avgUtilPct: number | null;
  approvedHours: number;
  availableHours: number;
  billableHours: number;
  nonBillableHours: number;
  benchHours: number;
  breakdown?: { label: string; pct: number | null }[];
  onViewFull: () => void;
}) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionLabel style={{ marginBottom: 0 }}>{title}</SectionLabel>
        <button onClick={onViewFull} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--info)', fontSize: 11, fontWeight: 500, padding: '2px 4px', borderRadius: 4,
        }}>
          Full report <ArrowRight size={11} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <UtilPctDonut pct={avgUtilPct} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
          <div>
            <span style={{ color: 'var(--txt-dim)' }}>Approved </span>
            <span style={{ color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>{approvedHours.toFixed(1)}h</span>
          </div>
          <div>
            <span style={{ color: 'var(--txt-dim)' }}>Available </span>
            <span style={{ color: 'var(--txt)', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>{availableHours.toFixed(1)}h</span>
          </div>
        </div>
      </div>

      <CategoryDonut billableHours={billableHours} nonBillableHours={nonBillableHours} benchHours={benchHours} />

      {breakdown && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Weekly Trend
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {breakdown.map(b => (
              <div key={b.label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 9px', borderRadius: 6,
                background: `color-mix(in srgb, ${utilColor(b.pct)} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${utilColor(b.pct)} 25%, transparent)`,
              }}>
                <span style={{ fontSize: 10, color: 'var(--txt-mut)' }}>{b.label}</span>
                <span style={{ fontSize: 10, color: utilColor(b.pct), fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                  {fmtPct(b.pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Cutoff banner ──────────────────────────────────────────────────────────────

function CutoffBanner({
  status, cutoffPassed, cutoffTime, cutoffNextDay,
}: { status: string | null; cutoffPassed: boolean; cutoffTime: string | null; cutoffNextDay?: boolean }) {
  const needsAction = !status || status === 'DRAFT' || status === 'REJECTED';
  if (!needsAction) return null;
  // No shift assigned, or no cutoff configured on it — there is no deadline to warn about.
  if (!cutoffTime) return null;

  // 12-hour clock plus an explicit "next day": a bare "0:30" for a shift that ends after
  // midnight reads as though the deadline already passed this morning.
  const fmt = `${formatTime12h(cutoffTime)}${cutoffNextDay ? ' (next day)' : ''}`;

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
            {"Cutoff passed — EOD not submitted."}
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
          {status === 'DRAFT'
            ? "Draft saved — remember to submit."
            : "Today's EOD not yet submitted."}
        </span>
        <span style={{ fontSize: 12, color: 'var(--txt-mut)', marginLeft: 8 }}>
          Cutoff at {fmt}.
        </span>
      </div>
      <Link
        to="/eod/submit"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 6,
          background: 'var(--warn)', color: '#000',
          fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
        }}
      >
        Submit <ArrowRight size={12} />
      </Link>
    </div>
  );
}

// ── Blocked tasks panel ────────────────────────────────────────────────────────

function BlockersPanel({ tasks, onSelect }: { tasks: BlockedTask[]; onSelect: (t: BlockedTask) => void }) {
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
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel style={{ marginBottom: 0 }}>My Blockers</SectionLabel>
        <Link
          to="/blockers"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            color: 'var(--info)', fontSize: 11, fontWeight: 500, textDecoration: 'none',
          }}
        >
          View all <ArrowRight size={11} />
        </Link>
      </div>
      {tasks.map((t, i) => {
        const d = new Date(t.entryDate + 'T12:00:00');
        const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return (
          <div
            key={`${t.taskId}-${i}`}
            onClick={() => onSelect(t)}
            style={{
              padding: '9px 16px', borderTop: '1px solid var(--line)', cursor: 'pointer',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: 3,
              background: t.acknowledged ? 'var(--ok)' : 'var(--risk)', marginTop: 5, flexShrink: 0,
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
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: 'var(--txt-dim)' }}>
                <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--raised2)', color: 'var(--txt-mut)' }}>
                  {t.projectName}
                </span>
                <span>{dateLabel}</span>
                {t.acknowledged && (
                  <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Team Lead replied</span>
                )}
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
                ? <span style={{
                    display: 'inline-flex', width: 'fit-content',
                    padding: '2px 8px', borderRadius: 10,
                    background: `color-mix(in srgb, ${utilAccent} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${utilAccent} 30%, transparent)`,
                    fontSize: 11, color: utilAccent, fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  }}>
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

// ── Today's EOD Status ──────────────────────────────────────────────────────────
// Always visible (unlike CutoffBanner, which only renders when action is needed) so
// "what's today's status" has one persistent, unambiguous answer on the dashboard.

const TODAY_STATUS_META: Record<string, { color: string; label: string }> = {
  APPROVED:          { color: 'var(--ok)',     label: 'Approved' },
  SUBMITTED:         { color: 'var(--info)',   label: 'Pending Review' },
  DRAFT:             { color: 'var(--txt-dim)', label: 'Draft Saved' },
  REJECTED:          { color: 'var(--risk)',   label: 'Rejected' },
  MISSING:           { color: 'var(--txt-dim)', label: 'Not Submitted' },
};

function TodayStatusCard({
  status, submittedAt, cutoffTime, isWeekend,
}: {
  status: string;
  submittedAt: string | null;
  cutoffTime: string | null;
  isWeekend: boolean;
}) {
  const meta = TODAY_STATUS_META[status] ?? { color: 'var(--txt-dim)', label: status };
  const actionable = !isWeekend && (status === 'MISSING' || status === 'DRAFT' || status === 'REJECTED');
  // Null when the employee has no shift, or their shift has no cutoff — nothing to count down to.
  const cutoffLabel = cutoffTime ? `Not yet · cutoff ${formatTime12h(cutoffTime)}` : 'Not yet';

  return (
    <Card style={{ marginBottom: 20 }} pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 9, flexShrink: 0,
          background: `color-mix(in srgb, ${meta.color} 14%, var(--raised2))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {status === 'APPROVED'
            ? <CheckCircle2 size={19} color={meta.color} />
            : status === 'MISSING'
            ? <AlertCircle size={19} color={meta.color} />
            : <Clock size={19} color={meta.color} />}
        </div>

        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
            Today's EOD Status
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: meta.color, fontFamily: '"Space Grotesk", sans-serif' }}>
            {meta.label}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
            Submitted At
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
            {submittedAt ? formatDateTime(submittedAt) : isWeekend ? 'Weekend — not required' : cutoffLabel}
          </div>
        </div>

        {actionable && (
          <Link to="/eod/submit" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 7, flexShrink: 0,
            background: 'var(--brand)', color: '#fff',
            fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}>
            {status === 'DRAFT' ? 'Continue Draft' : status === 'MISSING' ? 'Submit Now' : 'Fix & Resubmit'} <ArrowRight size={12} />
          </Link>
        )}
      </div>
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

// Monday-start week, matching the backend's WeekTrend.weekStart convention.
function currentWeekStartISO(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toLocalISODate(d);
}

function currentMonthStartISO(): string {
  const d = new Date();
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const weekStart   = useMemo(() => currentWeekStartISO(), []);
  const monthStart  = useMemo(() => currentMonthStartISO(), []);
  const todayStr    = useMemo(() => todayISO(), []);
  const holidayYear = useMemo(() => new Date().getFullYear(), []);

  const { data: weekUtil }    = useUtilizationDetail(weekStart, todayStr);
  const { data: monthUtil }   = useUtilizationDetail(monthStart, todayStr);
  const { data: dashStats }   = useEmployeeDashboardStats(user?.id);
  const { data: projects }    = useEmployeeProjects(user?.id);
  const { data: holidays }    = useHolidaysForYear(holidayYear);

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

      {/* Today's EOD status — always visible */}
      <TodayStatusCard
        status={dashStats?.todayStatus.status ?? (cutoffStatus.entryStatus ?? 'MISSING')}
        submittedAt={dashStats?.todayStatus.submittedAt ?? null}
        cutoffTime={cutoffStatus.cutoffTime}
        isWeekend={isWeekend}
      />

      {/* Cutoff banner */}
      {!isWeekend && (
        <CutoffBanner
          status={cutoffStatus.entryStatus}
          cutoffPassed={cutoffStatus.cutoffPassed}
          cutoffTime={cutoffStatus.cutoffTime}
          cutoffNextDay={cutoffStatus.cutoffNextDay}
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

        {/* Right: Pending corrections + Missed submissions + Blockers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PendingCorrectionsPanel corrections={dashStats?.pendingCorrections ?? []} />
          <MissedSubmissionsPanel dates={dashStats?.missedDates ?? []} count={dashStats?.missedCount ?? 0} />
          <BlockersPanel tasks={blockedTasks} onSelect={(t) => navigate(`/blockers?highlight=${t.taskId}`)} />
        </div>
      </div>

      {/* Assigned projects + Holidays */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <AssignedProjectsPanel projects={projects ?? []} />
        <HolidaysPanel holidays={holidays ?? []} year={holidayYear} />
      </div>

      {/* Weekly / Monthly utilization */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <UtilPeriodCard
          title="Weekly Utilization"
          avgUtilPct={weekUtil?.currentPeriod.avgUtilPct ?? null}
          approvedHours={weekUtil?.currentPeriod.totalApproved ?? 0}
          availableHours={weekUtil?.currentPeriod.totalAvailable ?? 0}
          billableHours={weekUtil?.categoryBreakdown.billableHours ?? 0}
          nonBillableHours={weekUtil?.categoryBreakdown.nonBillableHours ?? 0}
          benchHours={weekUtil?.categoryBreakdown.benchHours ?? 0}
          onViewFull={() => navigate('/utilization')}
        />
        <UtilPeriodCard
          title="Monthly Utilization"
          avgUtilPct={monthUtil?.currentPeriod.avgUtilPct ?? null}
          approvedHours={monthUtil?.currentPeriod.totalApproved ?? 0}
          availableHours={monthUtil?.currentPeriod.totalAvailable ?? 0}
          billableHours={monthUtil?.categoryBreakdown.billableHours ?? 0}
          nonBillableHours={monthUtil?.categoryBreakdown.nonBillableHours ?? 0}
          benchHours={monthUtil?.categoryBreakdown.benchHours ?? 0}
          breakdown={monthUtil?.weeklyTrend.map(w => ({
            label: new Date(w.weekStart + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            pct: w.avgUtilPct,
          }))}
          onViewFull={() => navigate('/utilization')}
        />
      </div>

      {/* Recent entries */}
      <RecentActivity entries={recentEntries} />
    </div>
  );
}
