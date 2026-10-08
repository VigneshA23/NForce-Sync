import type { UseQueryResult } from '@tanstack/react-query';
import type { UtilizationDay, UtilizationDays, UtilizationSummary } from '../../../api/teamUtilization';
import { extractError } from '../../approvals/shared';
import {
  STATUS_META, averageColor, dayLabel, dayOfMonth, fmtPct, fmtRange, lastWorkingDays, leadingBlanks, weekdayShort,
} from './utilizationLogic';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const monthTitle = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Same scale as the member bar, so a 120% day reads as taller than a 100% one. */
const BAR_CAP = 125;
const barHeight = (pct: number | null) => Math.max(3, Math.min(pct ?? 0, BAR_CAP) / BAR_CAP * 60);

/** Colour for a selectable day: its status colour, or dim for a leave day. */
function dayColor(d: UtilizationDay): string {
  return d.status ? STATUS_META[d.status].color : 'var(--txt-dim)';
}

function LeaveBadge() {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '.02em', padding: '1px 5px', borderRadius: 999,
      color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 16%, transparent)',
    }}>
      Leave
    </span>
  );
}

function Bar({ d, selected, onSelect }: { d: UtilizationDay; selected: boolean; onSelect: (date: string) => void }) {
  const off = !d.selectable;
  const color = dayColor(d);
  const label = `${weekdayShort(d.date)}`;
  return (
    <button
      type="button"
      className="tu-day"
      disabled={off}
      aria-pressed={selected}
      aria-label={dayLabel(d)}
      title={dayLabel(d)}
      onClick={() => onSelect(d.date)}
    >
      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: off ? 'var(--txt-dim)' : 'var(--txt-mut)', minHeight: 14 }}>
        {off ? '–' : d.leave ? <LeaveBadge /> : fmtPct(d.utilizationPct)}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: '100%', borderRadius: '5px 5px 2px 2px',
          height: off || d.leave ? 3 : barHeight(d.utilizationPct),
          background: off ? 'var(--line)' : color,
          opacity: !off && !d.leave && !d.utilizationPct ? 0.35 : 1,
        }}
      />
      <small style={{ fontSize: 10.5, color: off ? 'var(--txt-dim)' : 'var(--txt-mut)', textAlign: 'center', lineHeight: 1.25 }}>
        {label}<br />{dayOfMonth(d.date)}
      </small>
    </button>
  );
}

// The same themed day-status palette the employee dashboard's Monthly Activity calendar uses
// (index.css --day-*), so both calendars read alike in light and dark mode.
interface TileLook { bg: string; text: string; border: string }

const tint = (text: string) => `color-mix(in srgb, ${text} 40%, transparent)`;
const look = (name: 'approved' | 'pending' | 'rejected' | 'missed' | 'holiday' | 'weekend' | 'empty'): TileLook => ({
  bg: `var(--day-${name}-bg)`,
  text: `var(--day-${name}-text)`,
  border: tint(`var(--day-${name}-text)`),
});

const LOOKS = {
  optimal: look('approved'),   // green
  under: look('rejected'),     // amber
  over: look('missed'),        // red
  none: look('empty'),         // neutral grey
  leave: look('pending'),      // blue
  holiday: look('holiday'),    // purple
  weekend: look('weekend'),    // slate
  future: { bg: 'var(--raised)', text: 'var(--txt-dim)', border: 'var(--line)' } satisfies TileLook,
};

function tileLook(d: UtilizationDay): TileLook {
  // Holidays and weekly offs first, so they stay visibly "off" even when they fall on a future date.
  if (d.holiday) return LOOKS.holiday;
  if (d.weekend) return LOOKS.weekend;
  if (d.future) return LOOKS.future;
  if (d.leave) return LOOKS.leave;
  switch (d.status) {
    case 'optimal': return LOOKS.optimal;
    case 'under': return LOOKS.under;
    case 'over': return LOOKS.over;
    default: return LOOKS.none;
  }
}

function Cell({ d, selected, onSelect }: { d: UtilizationDay; selected: boolean; onSelect: (date: string) => void }) {
  const t = tileLook(d);
  const nonWorking = d.holiday || d.weekend;
  return (
    <button
      type="button"
      className="tu-cell"
      disabled={!d.selectable}
      aria-pressed={selected}
      aria-label={dayLabel(d)}
      title={dayLabel(d)}
      onClick={() => onSelect(d.date)}
      style={{
        background: t.bg,
        // Today is outlined in the brand colour (it isn't completed yet); the selected day gets the info ring via CSS.
        border: `1.5px solid ${d.today ? 'var(--brand-bright)' : t.border}`,
        color: t.text,
        opacity: d.future && !nonWorking ? 0.7 : 1,
      }}
    >
      <span className="tu-cell-num">{dayOfMonth(d.date)}</span>
      {nonWorking ? (
        <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: t.text }} />
      ) : d.leave ? (
        <span className="tu-cell-sub">Leave</span>
      ) : d.selectable ? (
        <span className="tu-cell-sub">{fmtPct(d.utilizationPct)}</span>
      ) : null}
    </button>
  );
}

const LEGEND: { label: string; look: TileLook }[] = [
  { label: 'Optimal', look: LOOKS.optimal },
  { label: 'Under-utilised', look: LOOKS.under },
  { label: 'Overloaded', look: LOOKS.over },
  { label: 'No hours', look: LOOKS.none },
  { label: 'Leave', look: LOOKS.leave },
  { label: 'Holiday', look: LOOKS.holiday },
  { label: 'Weekly off', look: LOOKS.weekend },
];

function AvgTag({ avg, thresholds }: { avg: number | null; thresholds: UtilizationDays['thresholds'] }) {
  if (avg === null) return null;
  const color = averageColor(avg, thresholds);
  return (
    <span style={{
      marginLeft: 8, fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, fontWeight: 600, padding: '2px 8px',
      borderRadius: 999, color, background: `color-mix(in srgb, ${color} 15%, transparent)`,
    }}>
      avg {fmtPct(avg)}
    </span>
  );
}

/**
 * Right-hand box of the expanded row: pick the date whose entries the left box shows.
 * Day → last 5 working days · Week → the week's daily bars · Month → calendar heat-map.
 * Weekend / holiday / future days are disabled; leave days stay clickable with a Leave badge.
 */
export function DatePanel({
  summary, query, selected, onSelect,
}: {
  summary: UtilizationSummary;
  query: UseQueryResult<UtilizationDays>;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const { data, isPending, isError, error, refetch } = query;

  const heading =
    summary.period === 'day' ? 'Last 5 working days'
    : summary.period === 'week' && data ? `Daily utilization · ${fmtRange(data.from, data.to)}`
    : 'Daily utilization';

  let body: React.ReactNode;
  if (isPending) {
    body = <div className="skeleton" style={{ height: summary.period === 'month' ? 230 : 96, borderRadius: 8 }} aria-busy="true" />;
  } else if (isError || !data) {
    body = (
      <div role="alert" style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>
        <div style={{ color: 'var(--risk)', marginBottom: 8 }}>Couldn't load the daily breakdown. {extractError(error)}</div>
        <button type="button" className="tu-retry" onClick={() => refetch()}>Retry</button>
      </div>
    );
  } else if (summary.period === 'month') {
    const blanks = leadingBlanks(data.from);
    body = (
      <div className="tu-cal">
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 10 }}>
          {monthTitle(data.from)}
        </div>
        <div className="tu-calgrid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => (
            <span key={w} className="tu-calhead">{w}</span>
          ))}
          {Array.from({ length: blanks }).map((_, i) => <span key={`b${i}`} />)}
          {data.days.map(d => <Cell key={d.date} d={d} selected={selected === d.date} onSelect={onSelect} />)}
        </div>
        <div className="tu-callegend">
          {LEGEND.map(({ label, look: l }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{
                width: 10, height: 10, borderRadius: 3, flexShrink: 0, boxSizing: 'border-box',
                background: l.bg, border: `1.5px solid ${l.text}`,
              }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  } else {
    const bars = summary.period === 'day' ? lastWorkingDays(data.days, summary.to ?? data.to, 5) : data.days;
    body = (
      <div className="tu-bars" style={{ height: summary.period === 'week' ? 110 : 86 }}>
        {bars.map(d => <Bar key={d.date} d={d} selected={selected === d.date} onSelect={onSelect} />)}
      </div>
    );
  }

  return (
    <div className="tu-panel tu-picker">
      <h3 style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--txt-mut)' }}>
        {heading}
        {data && summary.period !== 'day' && <AvgTag avg={data.averageUtilizationPct} thresholds={data.thresholds} />}
      </h3>
      <div className="tu-panel-body" style={{ justifyContent: summary.period === 'month' ? 'center' : undefined }}>{body}</div>
    </div>
  );
}
