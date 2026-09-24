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
import { GlobalLoader } from '../../components/GlobalLoader';
import { KpiCard } from '../../components/KpiCard';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { utilColor, fmtPct } from '../../lib/rules';
import { formatDate, formatDateTime, formatTime12h, toLocalISODate, todayISO } from '../../lib/date';
import { useHashScroll } from '../../lib/useHashScroll';

// ── Primitives ─────────────────────────────────────────────────────────────────


function Card({
  children, style, pad = 20, className,
}: { children: React.ReactNode; style?: React.CSSProperties; pad?: number; className?: string }) {
  return (
    <div className={className} style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 10, padding: pad, ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, style, id }: { children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <div id={id} style={{
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
      scrollMarginTop: 72,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Calendar cell helpers ──────────────────────────────────────────────────────

// Palette for the Monthly Activity calendar — matches the EOD lifecycle stages
// (Approved → Pending → Rejected/Missed) plus the non-working day types. Each status
// resolves through a themed CSS variable (index.css) so the tint stays a legible,
// theme-appropriate shade in both light and dark mode rather than a fixed hex.
const DAY_COLORS = {
  APPROVED:  { bg: 'var(--day-approved-bg)', text: 'var(--day-approved-text)' },
  SUBMITTED: { bg: 'var(--day-pending-bg)',  text: 'var(--day-pending-text)' },
  REJECTED:  { bg: 'var(--day-rejected-bg)', text: 'var(--day-rejected-text)' },
  MISSED:    { bg: 'var(--day-missed-bg)',   text: 'var(--day-missed-text)' },
  HOLIDAY:   { bg: 'var(--day-holiday-bg)',  text: 'var(--day-holiday-text)' },
  WEEKEND:   { bg: 'var(--day-weekend-bg)',  text: 'var(--day-weekend-text)' },
  EMPTY:     { bg: 'var(--day-empty-bg)',    text: 'var(--day-empty-text)' },
} as const;

function cellTint(day: CalendarDay, isToday: boolean): string {
  // Today is always a solid filled brand-red circle, regardless of its own status tint —
  // matches the reference's "selected day" treatment and gives "today" one unambiguous look.
  if (isToday) return 'var(--brand)';
  // Checked before the future/empty fallback so a holiday or weekend still reads as a
  // non-working day even when it falls on a not-yet-arrived date.
  if (day.status === 'HOLIDAY') return DAY_COLORS.HOLIDAY.bg;
  if (day.isWeekend) return DAY_COLORS.WEEKEND.bg;
  // Future days get a blank/unfilled look — distinct from "No entry", which flags a
  // past working day that's actually missing a submission.
  if (day.isFuture) return 'var(--raised)';
  if (day.status === 'EMPTY') return DAY_COLORS.EMPTY.bg;
  switch (day.status) {
    case 'APPROVED':  return DAY_COLORS.APPROVED.bg;
    case 'SUBMITTED': return DAY_COLORS.SUBMITTED.bg;
    case 'DRAFT':      return 'color-mix(in srgb, var(--txt-dim) 18%, var(--raised2))';
    case 'REJECTED':  return DAY_COLORS.REJECTED.bg;
    case 'MISSED':    return DAY_COLORS.MISSED.bg;
    default:          return DAY_COLORS.EMPTY.bg;
  }
}

function cellBorderColor(day: CalendarDay, isToday: boolean): string {
  if (isToday) return 'rgba(255,255,255,.45)';
  if (day.status === 'HOLIDAY') return `color-mix(in srgb, ${DAY_COLORS.HOLIDAY.text} 40%, transparent)`;
  if (day.isWeekend) return `color-mix(in srgb, ${DAY_COLORS.WEEKEND.text} 40%, transparent)`;
  if (day.isFuture) return 'var(--line)';
  if (day.status === 'SUBMITTED') return `color-mix(in srgb, ${DAY_COLORS.SUBMITTED.text} 40%, transparent)`;
  return 'transparent';
}

function cellTextColor(day: CalendarDay, isToday: boolean): string {
  if (isToday) return '#fff';
  if (day.status === 'HOLIDAY') return DAY_COLORS.HOLIDAY.text;
  if (day.isWeekend) return DAY_COLORS.WEEKEND.text;
  if (day.isFuture) return 'var(--txt-dim)';
  if (day.status === 'EMPTY') return DAY_COLORS.EMPTY.text;
  switch (day.status) {
    case 'APPROVED':  return DAY_COLORS.APPROVED.text;
    case 'SUBMITTED': return DAY_COLORS.SUBMITTED.text;
    case 'REJECTED':  return DAY_COLORS.REJECTED.text;
    case 'MISSED':    return DAY_COLORS.MISSED.text;
    default:          return 'var(--txt-mut)';
  }
}

function cellDotColor(day: CalendarDay): string {
  if (day.status === 'HOLIDAY') return DAY_COLORS.HOLIDAY.text;
  if (day.isWeekend) return DAY_COLORS.WEEKEND.text;
  switch (day.status) {
    case 'APPROVED':  return DAY_COLORS.APPROVED.text;
    case 'SUBMITTED': return DAY_COLORS.SUBMITTED.text;
    case 'DRAFT':      return 'var(--txt-dim)';
    case 'MISSED':    return DAY_COLORS.MISSED.text;
    case 'REJECTED':  return DAY_COLORS.REJECTED.text;
    default:          return 'transparent';
  }
}

function calendarTooltip(day: CalendarDay): string {
  const d = new Date(day.date + 'T12:00:00');
  const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (day.status === 'HOLIDAY') return `${label} - Holiday${day.holidayName ? `: ${day.holidayName}` : ''}`;
  if (day.isWeekend) return `${label} - Weekend`;
  if (day.isFuture)  return `${label} - Future`;
  if (day.status === 'EMPTY') return `${label} - No entry`;
  if (day.status === 'APPROVED') {
    return `${label} - Approved · ${fmtPct(day.utilizationPct ?? null)}`;
  }
  const labels: Record<string, string> = {
    SUBMITTED: 'Submitted (pending review)',
    DRAFT: 'Draft - not submitted',
    MISSED: 'Missed',
    REJECTED: 'Rejected - needs resubmission',
  };
  return `${label} - ${labels[day.status] ?? day.status}`;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    APPROVED:          { color: 'var(--ok)',       label: 'Approved' },
    SUBMITTED:         { color: 'var(--warn)',      label: 'Pending' },
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
  days, monthOffset, onPrev, onNext, maxOffset, minOffset, todayStr,
}: {
  days: CalendarDay[];
  monthOffset: number;
  onPrev: () => void;
  onNext: () => void;
  maxOffset: number;
  minOffset: number;
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

  // Cell size drives the nav bar, the day headers, the month grid and the
  // legend alike. Exposing it as a CSS variable lets a media query shrink the
  // calendar on phones (7 × 52px + gaps = 394px overflows a 375px screen)
  // while keeping all four in lockstep. The JS constant remains the desktop
  // value and is never recomputed.
  const gridWidth = 'var(--nf-cal-width)';
  const prevDisabled = monthOffset >= maxOffset;
  const nextDisabled = monthOffset <= minOffset;

  return (
    <div
      className="nf-cal"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        // Fluid instead of stepped: the cell (and everything keyed to it — nav bar, day
        // headers, legend) scales continuously with viewport width rather than jumping at
        // two fixed breakpoints, so it always fits the space it's actually given.
        '--nf-cal-cell': `clamp(34px, 7vw, ${CELL_PX}px)`,
        '--nf-cal-width': `calc(var(--nf-cal-cell) * 7 + ${CELL_GAP * 6}px)`,
      } as React.CSSProperties}
    >
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', width: gridWidth, marginBottom: 16 }}>
        <button onClick={onPrev} disabled={prevDisabled} style={navBtnStyle(prevDisabled)}>
          <ChevronLeft size={13} /> Previous
        </button>
        <span style={{
          flex: 1, textAlign: 'center',
          fontSize: 14, fontWeight: 700, color: 'var(--txt)',
          fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', letterSpacing: '-0.01em',
        }}>
          {monthLabel}
        </span>
        <button onClick={onNext} disabled={nextDisabled} style={navBtnStyle(nextDisabled)}>
          Next <ChevronRight size={13} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, var(--nf-cal-cell))',
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
        display: 'grid', gridTemplateColumns: 'repeat(7, var(--nf-cal-cell))',
        gap: CELL_GAP, width: gridWidth,
      }}>
        {/* Leading empty cells for weekday offset */}
        {Array.from({ length: leadingEmpties }).map((_, i) => (
          <div key={`pad-${i}`} style={{ width: 'var(--nf-cal-cell)', height: 'var(--nf-cal-cell)' }} />
        ))}

        {/* Day cells */}
        {days.map((day) => {
          const isToday = day.date === todayStr;
          const dayNum  = new Date(day.date + 'T12:00:00').getDate();
          const showDot = day.status === 'HOLIDAY' || day.isWeekend || (!day.isFuture && day.status !== 'EMPTY');
          return (
            <div
              key={day.date}
              title={calendarTooltip(day)}
              style={{
                width: 'var(--nf-cal-cell)', height: 'var(--nf-cal-cell)',
                borderRadius: 7,
                background: cellTint(day, isToday),
                border: `1.5px solid ${cellBorderColor(day, isToday)}`,
                boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 3, cursor: 'default',
                transition: 'filter 0.1s',
                boxShadow: isToday
                  ? '0 0 0 2px color-mix(in srgb, var(--brand-bright) 45%, transparent)'
                  : undefined,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter = ''; }}
            >
              <span style={{
                fontSize: 13, fontWeight: 600, lineHeight: 1,
                color: cellTextColor(day, isToday), fontVariantNumeric: 'tabular-nums',
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
          { bg: DAY_COLORS.APPROVED.bg,  label: 'Approved' },
          { bg: DAY_COLORS.SUBMITTED.bg, label: 'Pending' },
          { bg: DAY_COLORS.REJECTED.bg,  label: 'Rejected' },
          { bg: DAY_COLORS.MISSED.bg,    label: 'Missed' },
          { bg: DAY_COLORS.HOLIDAY.bg,   label: 'Holiday' },
          { bg: DAY_COLORS.WEEKEND.bg,   label: 'Weekly off' },
          { bg: DAY_COLORS.EMPTY.bg,     label: 'No entry', border: '1px solid var(--line)' },
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
  // Holidays are non-working days, same as weekends — excluded from the working-day
  // denominator so they don't dilute the completion percentage or read as "upcoming" work.
  const workingDays  = days.filter(d => !d.isWeekend && d.status !== 'HOLIDAY').length;
  const pastDays     = days.filter(d => !d.isWeekend && !d.isFuture && d.status !== 'HOLIDAY').length;
  const approved     = days.filter(d => d.status === 'APPROVED').length;
  const submitted    = days.filter(d => d.status === 'SUBMITTED').length;
  const missed       = days.filter(d => d.status === 'MISSED').length;
  const needsAction  = days.filter(d => d.status === 'REJECTED').length;
  const holiday      = days.filter(d => d.status === 'HOLIDAY').length;
  const empty        = days.filter(d => !d.isWeekend && !d.isFuture && d.status === 'EMPTY').length;
  const upcoming     = days.filter(d => !d.isWeekend && d.isFuture && d.status !== 'HOLIDAY').length;
  const completePct  = pastDays > 0 ? Math.round((approved + submitted) / pastDays * 100) : 0;

  return (
    <div>
      <SectionLabel id="month-overview">Month Overview</SectionLabel>

      {/* Completion donut + total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <SegmentDonut
          size={76}
          centerValue={`${completePct}%`}
          segments={[
            { label: 'Approved',     value: approved,    color: 'var(--ok)' },
            { label: 'Pending',      value: submitted,   color: 'var(--warn)' },
            { label: 'Needs action', value: needsAction, color: 'var(--risk)' },
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
          { color: 'var(--warn)',    count: submitted,   label: 'Pending review' },
          { color: 'var(--risk)',    count: needsAction, label: 'Needs action' },
          { color: 'var(--risk)',    count: missed,      label: 'Missed' },
          { color: 'var(--cat-4)', count: holiday,     label: 'Holiday' },
          { color: 'var(--txt-dim)', count: empty,       label: 'Not submitted' },
          { color: 'var(--line2)',   count: upcoming,    label: 'Upcoming' },
        ] as { color: string; count: number; label: string }[]).map(({ color, count, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{
              fontSize: 12, fontVariantNumeric: 'tabular-nums',
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
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {corrections.map(c => (
            <div key={c.entryId} style={{
              padding: '9px 16px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--txt-mut)' }}>
                    {formatDate(c.entryDate)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--risk)' }}>
                    Rejected
                  </span>
                </div>
                {c.reviewerComment && (
                  <div style={{ fontSize: 11, color: 'var(--txt-mut)', lineHeight: 1.4 }}>
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
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Missed Submissions ──────────────────────────────────────────────────────────

function MissedSubmissionsPanel({ dates, count }: { dates: string[]; count: number }) {
  const severity = count === 0 ? 'ok' : count <= 2 ? 'warn' : 'risk';
  const severityColor = severity === 'ok' ? 'var(--ok)' : severity === 'warn' ? 'var(--warn)' : 'var(--risk)';

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
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {dates.map(date => (
            <div key={date} style={{
              padding: '9px 16px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>
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
        </div>
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
        <SectionLabel id="assigned-projects" style={{ marginBottom: 0 }}>Assigned Projects</SectionLabel>
        {projects.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)' }}>
            {projects.length}
          </span>
        )}
      </div>
      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 20px', fontSize: 12, color: 'var(--txt-dim)' }}>
          No active project assignments
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {projects.map(p => (
            <div key={p.projectId} style={{
              padding: '9px 16px', borderTop: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 500, marginBottom: 2 }}>
                  {p.projectName}
                  <span style={{ fontSize: 10, color: 'var(--txt-dim)', marginLeft: 6 }}>
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
          ))}
        </div>
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
        <SectionLabel id="holiday-calendar" style={{ marginBottom: 0 }}>Holiday Calendar - {year}</SectionLabel>
        {holidays.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-dim)' }}>
            {holidays.length}
          </span>
        )}
      </div>
      {holidays.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0 20px', fontSize: 12, color: 'var(--txt-dim)' }}>
          No holidays configured for {year}
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
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
                <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
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
  title, avgUtilPct, approvedHours, availableHours, productiveHours, benchHours, breakdown, onViewFull,
}: {
  title: string;
  avgUtilPct: number | null;
  approvedHours: number;
  availableHours: number;
  productiveHours: number;
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
            <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{approvedHours.toFixed(1)}h</span>
          </div>
          <div>
            <span style={{ color: 'var(--txt-dim)' }}>Available </span>
            <span style={{ color: 'var(--txt)', fontWeight: 600 }}>{availableHours.toFixed(1)}h</span>
          </div>
        </div>
      </div>

      <CategoryDonut productiveHours={productiveHours} benchHours={benchHours} />

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
                <span style={{ fontSize: 10, color: utilColor(b.pct), fontWeight: 600 }}>
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

// ── Blocked tasks panel ────────────────────────────────────────────────────────

function BlockersPanel({ tasks, onSelect }: { tasks: BlockedTask[]; onSelect: (t: BlockedTask) => void }) {
  if (tasks.length === 0) {
    return (
      <Card style={{ height: '100%' }}>
        <SectionLabel id="dashboard-blockers">My Blockers</SectionLabel>
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--txt-dim)' }}>
          <CheckCircle2 size={24} style={{ color: 'var(--ok)', display: 'block', margin: '0 auto 8px' }} />
          No active blockers
        </div>
      </Card>
    );
  }

  return (
    <Card pad={0} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel id="dashboard-blockers" style={{ marginBottom: 0 }}>My Blockers</SectionLabel>
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
      {/* flex:1 + minHeight:0 lets this list absorb whatever vertical space is left in the
          right rail (rather than a fixed cap), so the rail's total height tracks the
          calendar card next to it instead of falling short or overflowing it. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
                  <div style={{ fontSize: 10, color: 'var(--txt-mut)', lineHeight: 1.4, marginBottom: 3 }}>
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
      </div>
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
        <SectionLabel id="recent-entries">Recent Entries</SectionLabel>
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
            <div key={entry.id} className="nf-r-pairs" style={{
              padding: '10px 16px', borderTop: '1px solid var(--line)',
              display: 'grid', gridTemplateColumns: '150px 1fr auto auto',
              gap: 12, alignItems: 'center',
            }}>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>
                {dateLabel}
              </div>
              <StatusBadge status={entry.status} />
              {entry.status === 'APPROVED'
                ? <span style={{
                    display: 'inline-flex', width: 'fit-content',
                    padding: '2px 8px', borderRadius: 10,
                    background: `color-mix(in srgb, ${utilAccent} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${utilAccent} 30%, transparent)`,
                    fontSize: 11, color: utilAccent, 
                    fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmtPct(entry.utilizationPct ?? null)}
                  </span>
                : <span />
              }
              <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums' }}>
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
// Always visible, so "what's today's status" has one persistent, unambiguous answer on
// the dashboard.

const TODAY_STATUS_META: Record<string, { color: string; label: string }> = {
  APPROVED:          { color: 'var(--ok)',     label: 'Approved' },
  SUBMITTED:         { color: 'var(--warn)',   label: 'Pending Review' },
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
          <div style={{ fontSize: 15, fontWeight: 700, color: meta.color, fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>
            {meta.label}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
            Submitted At
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt-mut)' }}>
            {submittedAt ? formatDateTime(submittedAt) : isWeekend ? 'Weekend - not required' : cutoffLabel}
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


// ── Main ───────────────────────────────────────────────────────────────────────

const MAX_MONTH_OFFSET = 12;

// How far the Next button can go into the future — through December of the CURRENT
// calendar year (e.g. viewed from any month in 2026, Next stops at Dec 2026; once
// 1 Jan 2027 arrives, it stops at Dec 2027 instead) — rather than stopping dead at the
// present month the way it used to. Computed from today's real date, not hardcoded, so
// it stays correct as the year turns over.
function minMonthOffsetToYearEnd(): number {
  const now = new Date();
  const nowIndex    = now.getFullYear() * 12 + now.getMonth();
  const targetIndex = now.getFullYear() * 12 + 11; // December, current year
  return -(targetIndex - nowIndex);
}

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
  // Plain useState with no URL/localStorage persistence — a refresh always remounts this
  // at 0 (the present month), which is the intended behavior.
  const [monthOffset, setMonthOffset] = useState(0);
  const minMonthOffset = useMemo(() => minMonthOffsetToYearEnd(), []);

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
  useHashScroll(!isPending);

  const weekStart   = useMemo(() => currentWeekStartISO(), []);
  const monthStart  = useMemo(() => currentMonthStartISO(), []);
  const todayStr    = useMemo(() => todayISO(), []);
  const holidayYear = useMemo(() => new Date().getFullYear(), []);

  const { data: weekUtil }    = useUtilizationDetail(weekStart, todayStr);
  const { data: monthUtil }   = useUtilizationDetail(monthStart, todayStr);
  const { data: dashStats }   = useEmployeeDashboardStats(user?.id);
  const { data: projects }    = useEmployeeProjects(user?.id);
  const { data: holidays }    = useHolidaysForYear(holidayYear);

  if (isPending) return <GlobalLoader fullScreen={false} />;

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>
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
  // Trusts the API's isWeekend flag (honors the admin-configured weekend rule) rather than
  // recomputing Sat/Sun locally.
  const isWeekend  = calendarData.find(d => d.date === cutoffStatus.today)?.isWeekend ?? false;

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
      <div style={{ marginBottom: 20 }}>
        <HeroBanner />
      </div>

      <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: '-8px 0 20px' }}>{todayLabel}</p>

      {/* Today's EOD status — always visible */}
      <TodayStatusCard
        status={dashStats?.todayStatus.status ?? (cutoffStatus.entryStatus ?? 'MISSING')}
        submittedAt={dashStats?.todayStatus.submittedAt ?? null}
        cutoffTime={cutoffStatus.cutoffTime}
        isWeekend={isWeekend}
      />

      {/* KPI tiles — full-width row */}
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard
          icon={<Clock size={18} />}
          label="This week approved"
          value={`${quickStats.weekApprovedHours.toFixed(1)}h`}
          accent="var(--info)"
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Month avg utilization"
          value={fmtPct(quickStats.monthAvgUtil)}
          accent={monthAvgColor}
        />
        <KpiCard
          icon={<Zap size={18} />}
          label="Approved streak"
          value={streakLabel}
          accent={quickStats.streak >= 5 ? 'var(--ok)' : quickStats.streak > 0 ? 'var(--info)' : 'var(--txt-dim)'}
          trend={quickStats.streak >= 5 ? { label: '🔥 On a roll', positive: true } : undefined}
        />
        <KpiCard
          icon={<Activity size={18} />}
          label="Last issue"
          value={dsiLabel}
          accent={
            quickStats.daysSinceLastIssue < 0 || quickStats.daysSinceLastIssue > 7 ? 'var(--ok)'
            : quickStats.daysSinceLastIssue <= 2 ? 'var(--risk)' : 'var(--warn)'
          }
          trend={quickStats.daysSinceLastIssue < 0 ? { label: 'in past 90 days', positive: true } : undefined}
        />
      </div>

      {/* Calendar card + Right panel */}
      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: 16, marginBottom: 16 }}>
        {/* Single card: calendar left + stats right */}
        <Card>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <SectionLabel id="monthly-activity" style={{ marginBottom: 0 }}>Monthly Activity</SectionLabel>
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
                onNext={() => setMonthOffset(o => Math.max(o - 1, minMonthOffset))}
                maxOffset={MAX_MONTH_OFFSET}
                minOffset={minMonthOffset}
                todayStr={cutoffStatus.today}
              />
            </div>

            {/* Vertical divider */}
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', flexShrink: 0 }} />

            {/* Month stats */}
            {/* minWidth: 0 overrides the flex-item default of min-width: auto — without it,
                this column refuses to shrink below its content's natural width and instead
                overflows past the card's right edge on narrower windows. */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <MonthStatsPanel days={calendarData} />
            </div>
          </div>
        </Card>

        {/* Right: Pending corrections + Missed submissions + Blockers. The column stretches
            to the calendar card's height (grid default), and Blockers — the last panel —
            grows to fill whatever's left, so the rail's bottom edge lines up with the
            calendar card's instead of stopping short or overflowing it. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          <PendingCorrectionsPanel corrections={dashStats?.pendingCorrections ?? []} />
          <MissedSubmissionsPanel dates={dashStats?.missedDates ?? []} count={dashStats?.missedCount ?? 0} />
          <div style={{ flex: 1, minHeight: 0 }}>
            <BlockersPanel tasks={blockedTasks} onSelect={(t) => navigate(`/blockers?highlight=${t.taskId}`)} />
          </div>
        </div>
      </div>

      {/* Assigned projects + Holidays */}
      <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <AssignedProjectsPanel projects={projects ?? []} />
        <HolidaysPanel holidays={holidays ?? []} year={holidayYear} />
      </div>

      {/* Weekly / Monthly utilization */}
      <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <UtilPeriodCard
          title="Weekly Utilization"
          avgUtilPct={weekUtil?.currentPeriod.avgUtilPct ?? null}
          approvedHours={weekUtil?.currentPeriod.totalApproved ?? 0}
          availableHours={weekUtil?.currentPeriod.totalAvailable ?? 0}
          productiveHours={weekUtil?.categoryBreakdown.productiveHours ?? 0}
          benchHours={weekUtil?.categoryBreakdown.benchHours ?? 0}
          onViewFull={() => navigate('/utilization')}
        />
        <UtilPeriodCard
          title="Monthly Utilization"
          avgUtilPct={monthUtil?.currentPeriod.avgUtilPct ?? null}
          approvedHours={monthUtil?.currentPeriod.totalApproved ?? 0}
          availableHours={monthUtil?.currentPeriod.totalAvailable ?? 0}
          productiveHours={monthUtil?.categoryBreakdown.productiveHours ?? 0}
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
