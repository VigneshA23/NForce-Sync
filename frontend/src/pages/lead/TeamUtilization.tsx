import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search, ChevronDown, ChevronRight, Download, Calendar,
  Briefcase, FolderKanban, Clock, CalendarCheck, CalendarDays, Globe, Timer, Hourglass,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../lib/auth';
import { toLocalISODate, todayISO as localTodayISO, yesterdayISO, formatDateTime } from '../../lib/date';
import { useTeamUtil } from '../../api/utilization';
import {
  useTeamMemberStatuses, useTeamLeadSummary, useTeamMemberDetail, prefetchTeamMemberDetail,
  type MemberEodStatusDto,
} from '../../api/teamLead';
import { useMyLeadProjects } from '../../api/teamLeadProjects';
import { RingGauge } from '../../components/RingGauge';

// ── status derivation ───────────────────────────────────────────────────────────
// Reuses the exact status/underutilized/overloaded fields TeamLeadService already computes
// against the live Admin Config thresholds (BusinessRuleConfig) — no separate/hardcoded
// threshold logic here. `workingDay` (from the dashboard summary, same holiday/weekend rule
// UtilizationService.isWorkingDay applies) distinguishes a company holiday from ordinary
// individual leave, both of which the backend currently reports as ON_LEAVE.

type StatusKey = 'HEALTHY' | 'UNDERUTILIZED' | 'OVERALLOCATED' | 'ON_LEAVE' | 'NO_EOD' | 'HOLIDAY';

const STATUS_CFG: Record<StatusKey, { label: string; color: string }> = {
  HEALTHY:        { label: 'Optimal',        color: 'var(--ok)' },
  UNDERUTILIZED:  { label: 'Underutilized',  color: 'var(--warn)' },
  OVERALLOCATED:  { label: 'Overallocated',  color: 'var(--risk)' },
  ON_LEAVE:       { label: 'On Leave',       color: 'var(--info)' },
  NO_EOD:         { label: 'No EOD',         color: 'var(--txt-dim)' },
  HOLIDAY:        { label: 'Holiday',        color: 'var(--txt-dim)' },
};

function deriveStatus(m: MemberEodStatusDto, workingDay: boolean): StatusKey {
  if (m.status === 'ON_LEAVE') return workingDay ? 'ON_LEAVE' : 'HOLIDAY';
  if (m.status === 'MISSING') return 'NO_EOD';
  if (m.overloaded) return 'OVERALLOCATED';
  if (m.underutilized) return 'UNDERUTILIZED';
  return 'HEALTHY';
}

// ── merged member row model ──────────────────────────────────────────────────────

interface MergedMember {
  employeeId: number;
  name: string;
  code: string;
  project: string;
  projectNames: string[];
  pct: number | null;
  approvedHours: number;
  availableHours: number;
  status: StatusKey;
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function hrs(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtHeaderDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtChartDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** "Today, 5:42 PM" / "Yesterday, 5:42 PM" / full date+time otherwise — same idea as the
 * relative labels used on Approvals/TeamDashboard, applied to a full ISO timestamp. */
function fmtLastApproved(iso: string | null): string {
  if (!iso) return 'No approvals yet';
  const day = toLocalISODate(new Date(iso));
  const full = formatDateTime(iso);
  const timePart = full.split(', ')[1];
  if (day === localTodayISO()) return `Today, ${timePart}`;
  if (day === yesterdayISO()) return `Yesterday, ${timePart}`;
  return full;
}

// ── primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: StatusKey }) {
  const { label, color } = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function ProgressBar({ pct, color }: { pct: number | null; color: string }) {
  const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  );
}

type IconType = React.ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** Neutral default — used when a field has no accent color (e.g. Role with no data),
 * so an empty value never reads as if it were flagged positive/notable. */
const NEUTRAL_ICON_COLOR = 'var(--txt-dim)';

function IconBadge({ icon: Icon, color = NEUTRAL_ICON_COLOR, size = 24 }: { icon: IconType; color?: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
    }}>
      <Icon size={13} aria-hidden="true" />
    </div>
  );
}

function InfoRow({ icon, label, value, color }: { icon: IconType; label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <IconBadge icon={icon} color={color} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: IconType; label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--txt-dim)', fontSize: 11.5, marginBottom: 8 }}>
        <IconBadge icon={icon} color={color} size={22} /> {label}
      </div>
      <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 19, fontWeight: 700, color: 'var(--txt)' }}>{value}</div>
    </div>
  );
}

// ── date selector (single date, Today/Yesterday quick picks + custom) ──────────

function DateSelector({ dateISO, onChange }: { dateISO: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(dateISO);
  const today = localTodayISO();

  function openPicker() {
    setDraft(dateISO);
    setOpen(true);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--txt)',
          background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={13} aria-hidden="true" />
        {fmtHeaderDate(dateISO)}
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="nf-r-popover" style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 220,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => { onChange(today); setOpen(false); }}
                style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: dateISO === today ? 'var(--info)' : 'var(--raised2)', color: dateISO === today ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)' }}
              >
                Today
              </button>
              <button
                onClick={() => { onChange(yesterdayISO()); setOpen(false); }}
                style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: dateISO === yesterdayISO() ? 'var(--info)' : 'var(--raised2)', color: dateISO === yesterdayISO() ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)' }}
              >
                Yesterday
              </button>
            </div>
            <input
              type="date"
              value={draft}
              max={today}
              onChange={e => setDraft(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <button
              onClick={() => { onChange(draft); setOpen(false); }}
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

// ── select dropdown (Project / Status / Sort) ───────────────────────────────────

function SelectDropdown<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      style={{
        background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── member row (left panel) ─────────────────────────────────────────────────────
// Header row and body rows must share one template or the columns desync.
const MEMBER_TABLE_COLUMNS = '1fr 160px 110px 120px 20px';
// The four fixed columns plus gaps already need 466px; this leaves the name
// column room to stay readable. Well under the desktop content width.
const MEMBER_TABLE_MIN_WIDTH = 640;


function MemberRow({ member, selected, onSelect, onHover }: { member: MergedMember; selected: boolean; onSelect: () => void; onHover?: () => void }) {
  const color = STATUS_CFG[member.status].color;
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHover}
      style={{
        display: 'grid', gridTemplateColumns: MEMBER_TABLE_COLUMNS, gap: 14,
        alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
        background: selected ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : undefined,
        borderLeft: selected ? '3px solid var(--brand)' : '3px solid transparent',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
          background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
        }}>
          {initials(member.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--txt-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {member.project}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color, marginBottom: 4, fontFamily: '"JetBrains Mono", monospace' }}>
          {member.pct == null ? '—' : `${Math.round(member.pct)}%`}
        </div>
        <ProgressBar pct={member.pct} color={color} />
      </div>

      <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)' }}>
        {hrs(member.approvedHours)}h / {hrs(member.availableHours)}h
      </div>

      <div><StatusBadge status={member.status} /></div>

      <ChevronRight size={16} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
    </div>
  );
}

// ── weekly trend line chart ──────────────────────────────────────────────────────

function WeeklyTrendChart({ points }: { points: { date: string; value: number | null; workingDay: boolean }[] }) {
  // Recharts' category XAxis auto-thins ticks to avoid overlap unless told not to — without
  // `interval={0}` below it silently drops whichever labels it decides won't fit, which reads
  // as missing days rather than a rendering choice (that's what the "only 5 of 7 days shown"
  // bug actually was — every day's data point was always present). At 14 days there ARE too
  // many labels to show horizontally at full size, so those get rotated + shrunk instead of
  // dropped — every day still gets a tick, just a smaller/angled one.
  const dense = points.length > 7;

  const data = points.map(p => ({
    day: fmtChartDay(p.date),
    value: p.value != null ? Math.round(p.value) : null,
    workingDay: p.workingDay,
  }));

  if (data.every(d => d.value == null)) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--txt-dim)' }}>No utilization data in this range</span>
      </div>
    );
  }

  // The first point's dot sits right at the left edge of the plot area (margin-left is only
  // 4px, and the Y-axis column is 40px wide) — its value label is centered on the dot by
  // default, so half its text extends left into the Y-axis tick-label column and can collide
  // with a gridline label (e.g. "106%" over "125%"). Anchoring the first point's label to
  // start-from-the-dot (instead of centering on it) keeps it entirely inside the plot area.
  // Mirrored for the last point against the right edge for the same reason.
  const CustomDot = (props: { cx?: number; cy?: number; payload?: { value: number | null }; index?: number }) => {
    const { cx, cy, payload, index } = props;
    const value = payload?.value;
    if (value == null || cx == null || cy == null) return <g />;
    const isFirst = index === 0;
    const isLast = index === data.length - 1;
    const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
    return (
      <g>
        <text x={cx} y={cy - 10} textAnchor={anchor} fontSize={dense ? 9 : 11} fontWeight={600} fill="var(--txt-mut)">{value}%</text>
        <circle cx={cx} cy={cy} r={dense ? 3 : 4} fill="var(--ok)" stroke="var(--panel)" strokeWidth={2} />
      </g>
    );
  };

  // At 14 days, horizontal labels at full size would overlap — rotate + shrink instead of
  // relying on Recharts to drop some (see the `interval={0}` note above the component).
  const XAxisTick = (props: { x?: number; y?: number; payload?: { value: string }; index?: number }) => {
    const { x, y, payload, index } = props;
    if (x == null || y == null || payload == null || index == null) return <g />;
    const isWorkingDay = data[index]?.workingDay !== false;
    const opacity = isWorkingDay ? 1 : 0.45;
    if (dense) {
      return (
        <text
          x={x} y={y + 8} textAnchor="end" fontSize={9.5} fill="var(--txt-dim)" opacity={opacity}
          transform={`rotate(-40 ${x} ${y + 8})`}
        >
          {payload.value}
        </text>
      );
    }
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={10.5} fill="var(--txt-dim)" opacity={opacity}>
        {payload.value}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { payload: { value: number | null; workingDay: boolean } }[]; label?: string }) => {
    if (!active || !label) return null;
    const point = payload?.[0]?.payload ?? data.find(d => d.day === label);
    if (!point) return null;
    return (
      <div style={{ background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 7, fontSize: 12, padding: '6px 10px' }}>
        <div style={{ color: 'var(--txt-mut)', marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'var(--txt)' }}>{point.workingDay === false ? 'Non-working day' : `${point.value}% Utilization`}</div>
      </div>
    );
  };

  const maxValue = Math.max(100, ...data.map(d => d.value ?? 0));
  const axisMax = Math.ceil(maxValue / 25) * 25;
  const axisTicks = Array.from({ length: axisMax / 25 + 1 }, (_, i) => i * 25);

  return (
    <div style={{ height: dense ? 220 : 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 16, bottom: dense ? 24 : 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          {/* interval={0} forces every day to get a tick — without it Recharts silently
              thins ticks it decides won't fit, which is what previously made 2 of 7 real
              days vanish from the axis even though their data was always there. */}
          <XAxis dataKey="day" tick={<XAxisTick />} tickLine={false} axisLine={false} interval={0} height={dense ? 46 : 30} />
          <YAxis
            domain={[0, axisMax]} ticks={axisTicks}
            tick={{ fontSize: 10, fill: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}
            tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone" dataKey="value"
            stroke="var(--ok)" strokeWidth={2}
            connectNulls dot={<CustomDot />} activeDot={{ r: 5, fill: 'var(--ok)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── detail panel (right) ─────────────────────────────────────────────────────────

type TrendRange = '7' | '14';

function DetailPanel({ member, dateISO }: { member: MergedMember; dateISO: string }) {
  const [trendRange, setTrendRange] = useState<TrendRange>('7');
  // Switching the selected member resets the trend window back to the default — otherwise a
  // 14-day pick made for one employee would silently carry over and apply to the next.
  useEffect(() => { setTrendRange('7'); }, [member.employeeId]);

  const { data: detail, isPending, isError, refetch } = useTeamMemberDetail(member.employeeId, dateISO, Number(trendRange));
  const color = STATUS_CFG[member.status].color;
  const remaining = Math.max(0, member.availableHours - member.approvedHours);

  // A failed fetch must never render as if it were real data — "0d"/"—"/"No approvals yet"
  // all look like legitimate empty states, so silently falling back to them on error would
  // hide the failure instead of surfacing it (the same class of bug as Working Days
  // previously reading as a real 0 when it was actually just uncomputed).
  const detailFailed = isError;

  return (
    <Card style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700,
            background: 'var(--raised2)', color: 'var(--txt)', border: '1px solid var(--line2)',
          }}>
            {initials(member.name)}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>{member.name}</div>
            <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>{member.project}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusBadge status={member.status} />
        </div>
      </div>

      {/* Today's Utilization */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingBottom: 18, borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--txt-dim)', marginBottom: 6 }}>Today's Utilization</div>
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 34, fontWeight: 700, color, marginBottom: 10 }}>
            {member.pct == null ? '—' : `${Math.round(member.pct)}%`}
          </div>
          <ProgressBar pct={member.pct} color={color} />
          <div style={{ fontSize: 12, color: 'var(--txt-mut)', marginTop: 8 }}>
            Approved {hrs(member.approvedHours)}h / Available {hrs(member.availableHours)}h
          </div>
        </div>
        <RingGauge pct={member.pct ?? 0} color={color} label="Utilization" />
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard icon={Clock} label="Approved Hours" value={`${hrs(member.approvedHours)}h`} color="var(--info)" />
        <StatCard icon={Timer} label="Available Hours" value={`${hrs(member.availableHours)}h`} color="var(--warn)" />
        <StatCard icon={Hourglass} label="Remaining Hours" value={`${hrs(remaining)}h`} color="var(--ok)" />
      </div>

      {/* Weekly trend */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
            Weekly Trend <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}>(Approved Utilization %)</span>
          </div>
          <SelectDropdown
            value={trendRange}
            onChange={setTrendRange}
            options={[
              { value: '7', label: 'Last 7 Days' },
              { value: '14', label: 'Last 14 Days' },
            ]}
          />
        </div>
        {isPending ? (
          <Skel h={200} />
        ) : detailFailed ? (
          <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--risk)' }}>Couldn't load trend data.</span>
            <button
              onClick={() => refetch()}
              style={{ padding: '6px 12px', fontSize: 12, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <WeeklyTrendChart points={detail?.trend ?? []} />
        )}
      </div>

      {/* Info grid */}
      <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 16, columnGap: 16 }}>
        <InfoRow icon={FolderKanban} label="Current Project" value={member.project} color="var(--brand)" />
        <InfoRow icon={CalendarDays} label="Working Days" value={isPending ? '—' : detailFailed ? 'Error' : `${detail?.workingDays ?? 0}d`} color="var(--ok)" />
        <InfoRow
          icon={Briefcase}
          label="Role"
          value={isPending ? '—' : detailFailed ? 'Error' : (detail?.designation ?? '—')}
          color={detail?.designation ? 'var(--risk)' : undefined}
        />
        <InfoRow icon={CalendarCheck} label="Logged Days" value={isPending ? '—' : detailFailed ? 'Error' : `${detail?.loggedDays ?? 0}d`} color="var(--info)" />
        <InfoRow icon={Clock} label="Last Approved EOD" value={isPending ? '—' : detailFailed ? 'Error' : fmtLastApproved(detail?.lastApprovedEodAt ?? null)} color="var(--warn)" />
        {/* Every employee in this org is assumed IST — no per-user time zone field exists on
            the employee model, so this is a fixed organizational constant, not per-user data. */}
        <InfoRow icon={Globe} label="Time Zone" value="IST (UTC +05:30)" color="var(--brand)" />
      </div>
    </Card>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

type ProjectFilter = string;
type StatusFilter = 'ALL' | StatusKey;
type SortMode = 'util-desc' | 'util-asc' | 'name-asc';

/** Rows shown before collapsing behind "View all members". */
const MEMBER_LIST_CAP = 8;

export default function TeamUtilization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayISO = localTodayISO();
  const [dateISO, setDateISO] = useState(todayISO);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sort, setSort] = useState<SortMode>('util-desc');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAllMembers, setShowAllMembers] = useState(false);

  const range = useMemo(() => ({ from: dateISO, to: dateISO }), [dateISO]);
  const { data: statuses, isPending: statusesLoading, isError, refetch } = useTeamMemberStatuses(range);
  const { data: teamUtil, isPending: utilLoading } = useTeamUtil(user?.id, dateISO);
  const { data: summary } = useTeamLeadSummary(range);
  // Same source of truth as "My Projects" (TeamLeadProjectService.listMyProjects, scoped by
  // Project.pm to the logged-in Team Lead) — the Project filter must offer every project
  // actually assigned to this Team Lead, not just whatever project names happen to appear on
  // a team member's EOD entry for the single selected date (see allProjects below).
  const { data: leadProjects } = useMyLeadProjects();

  const isPending = statusesLoading || utilLoading;
  const workingDay = summary?.workingDay ?? true;

  const members: MergedMember[] = useMemo(() => {
    if (!statuses) return [];
    const utilByEmployee = new Map((teamUtil ?? []).map(u => [u.employeeId, u]));
    return statuses.map(m => {
      const util = utilByEmployee.get(m.id);
      return {
        employeeId: m.id,
        name: m.fullName,
        code: m.employeeCode,
        project: m.projectNames[0] ?? '—',
        projectNames: m.projectNames,
        pct: m.utilizationPct,
        approvedHours: util?.snapshot?.approvedProductiveHours ?? 0,
        availableHours: util?.snapshot?.availableHours ?? 0,
        status: deriveStatus(m, workingDay),
      };
    });
  }, [statuses, teamUtil, workingDay]);

  // Union of the Team Lead's actually-assigned projects (so every project they own is always
  // selectable, even before anyone logs an EOD against it today) with whatever project names
  // already appear on today's member statuses (kept so a project name can never disappear from
  // the filter merely because this list came from a different source moment-to-moment).
  const allProjects = useMemo(() => {
    const assigned = (leadProjects ?? []).map(p => p.name);
    const fromStatuses = members.flatMap(m => m.projectNames);
    return [...new Set([...assigned, ...fromStatuses])].sort();
  }, [leadProjects, members]);

  const visible = useMemo(() => {
    let list = members;
    if (projectFilter !== 'ALL') list = list.filter(m => m.projectNames.includes(projectFilter));
    if (statusFilter !== 'ALL') list = list.filter(m => m.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(m => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q));

    const sorted = [...list];
    if (sort === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'util-asc') sorted.sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1));
    else sorted.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    return sorted;
  }, [members, projectFilter, statusFilter, search, sort]);

  // Default-select the first visible member once data loads (matches the reference, where
  // the top row starts selected) — re-picks only when the current selection drops out of view.
  useEffect(() => {
    if (visible.length === 0) { setSelectedId(null); return; }
    if (!visible.some(m => m.employeeId === selectedId)) setSelectedId(visible[0].employeeId);
  }, [visible, selectedId]);

  const selected = visible.find(m => m.employeeId === selectedId) ?? null;

  // Team-level summary — computed from all members (not just visible) for a consistent header.
  const teamSummary = useMemo(() => {
    const withPct = members.filter(m => m.pct !== null);
    const avgPct = withPct.length > 0
      ? withPct.reduce((s, m) => s + (m.pct ?? 0), 0) / withPct.length
      : null;
    const totalApproved  = members.reduce((s, m) => s + m.approvedHours, 0);
    const totalAvailable = members.reduce((s, m) => s + m.availableHours, 0);
    const healthy = members.filter(m => m.status === 'HEALTHY').length;
    const under   = members.filter(m => m.status === 'UNDERUTILIZED').length;
    const over    = members.filter(m => m.status === 'OVERALLOCATED').length;
    const leave   = members.filter(m => m.status === 'ON_LEAVE' || m.status === 'HOLIDAY').length;
    const noEod   = members.filter(m => m.status === 'NO_EOD').length;
    return { avgPct, totalApproved, totalAvailable, healthy, under, over, leave, noEod };
  }, [members]);

  if (isPending) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div><Skel h={24} w={200} /><div style={{ marginTop: 8 }}><Skel h={14} w={280} /></div></div>
          <Skel h={36} w={240} />
        </div>
        <Card style={{ padding: 16 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <Skel h={32} w={32} /><Skel h={32} />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Team Utilization</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load utilization data.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Team Utilization
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            View and analyze your team's utilization and approved hours.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DateSelector dateISO={dateISO} onChange={setDateISO} />
          {/* No export pipeline exists anywhere in the app yet (same disabled affordance as
              the Team Dashboard's Quick Actions "Export Report" tile) — presented, not wired. */}
          <button
            disabled
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: 'var(--txt-dim)',
              background: 'var(--raised)', border: '1px solid var(--line)', cursor: 'not-allowed', opacity: 0.6,
            }}
          >
            <Download size={13} aria-hidden="true" /> Export Report
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="nf-r-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', marginBottom: 16 }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 12px' }}>
          <Search size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee..."
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <SelectDropdown
          value={projectFilter}
          onChange={setProjectFilter}
          options={[{ value: 'ALL', label: 'Project: All' }, ...allProjects.map(p => ({ value: p, label: p }))]}
        />
        <SelectDropdown
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: 'Status: All' },
            ...(Object.keys(STATUS_CFG) as StatusKey[]).map(k => ({ value: k, label: STATUS_CFG[k].label })),
          ]}
        />
        <div style={{ marginLeft: 'auto' }}>
          <SelectDropdown
            value={sort}
            onChange={setSort}
            options={[
              { value: 'util-desc', label: 'Sort by: Utilization (High to Low)' },
              { value: 'util-asc', label: 'Sort by: Utilization (Low to High)' },
              { value: 'name-asc', label: 'Sort by: Name (A-Z)' },
            ]}
          />
        </div>
      </div>

      {/* Team summary strip */}
      {members.length > 0 && (
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
          padding: '14px 18px', marginBottom: 16,
          display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center',
        }}>
          {/* Avg util */}
          <div style={{ minWidth: 180, flex: '1 1 180px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Team Avg Utilization
            </div>
            <ProgressBar pct={teamSummary.avgPct} color={teamSummary.avgPct == null ? 'var(--txt-dim)' : teamSummary.avgPct < 60 ? 'var(--warn)' : teamSummary.avgPct > 100 ? 'var(--risk)' : 'var(--ok)'} />
            <div style={{ marginTop: 4, fontSize: 12, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', color: teamSummary.avgPct == null ? 'var(--txt-dim)' : teamSummary.avgPct < 60 ? 'var(--warn)' : teamSummary.avgPct > 100 ? 'var(--risk)' : 'var(--ok)' }}>
              {teamSummary.avgPct == null ? 'N/A' : `${Math.round(teamSummary.avgPct)}%`}
            </div>
          </div>

          <div style={{ width: 1, height: 36, background: 'var(--line)', flexShrink: 0 }} />

          {/* Hours */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Approved / Available</div>
            <div style={{ fontSize: 13, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', color: 'var(--txt)' }}>
              {teamSummary.totalApproved.toFixed(1)}h
              <span style={{ color: 'var(--txt-dim)', marginLeft: 4, fontSize: 11 }}>/ {teamSummary.totalAvailable.toFixed(0)}h</span>
            </div>
          </div>

          <div style={{ width: 1, height: 36, background: 'var(--line)', flexShrink: 0 }} />

          {/* Status distribution chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Optimal',        count: teamSummary.healthy, color: 'var(--ok)' },
              { label: 'Under',          count: teamSummary.under,   color: 'var(--warn)' },
              { label: 'Over',           count: teamSummary.over,    color: 'var(--risk)' },
              { label: 'On Leave',       count: teamSummary.leave,   color: 'var(--info)' },
              { label: 'No EOD',         count: teamSummary.noEod,   color: 'var(--txt-dim)' },
            ].filter(s => s.count > 0).map(({ label, count, color }) => (
              <span key={label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                borderRadius: 20, fontSize: 11, fontWeight: 600,
                color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {count} {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Left: Team Members list */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header and rows share one scroll region so columns stay aligned
              while swiping; the footer below sits outside it. */}
          <div className="nf-r-scroll">
          <div className="nf-r-scroll-inner" style={{ '--nf-r-min': MEMBER_TABLE_MIN_WIDTH + 'px' } as React.CSSProperties}>
          <div style={{ display: 'grid', gridTemplateColumns: MEMBER_TABLE_COLUMNS, gap: 14, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Team Members ({visible.length})</span>
            <span style={{ fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Utilization</span>
            <span style={{ fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Approved / Available</span>
            <span style={{ fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
            <span />
          </div>

          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>No members match</div>
              <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Try clearing the search or filters.</div>
            </div>
          ) : (
            (showAllMembers ? visible : visible.slice(0, MEMBER_LIST_CAP)).map(m => (
              <MemberRow
                key={m.employeeId}
                member={m}
                selected={m.employeeId === selectedId}
                onSelect={() => setSelectedId(m.employeeId)}
                onHover={() => prefetchTeamMemberDetail(queryClient, m.employeeId, dateISO)}
              />
            ))
          )}
          </div>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--txt-dim)' }}>
            <span>
              Showing {visible.length === 0 ? 0 : 1} to {Math.min(showAllMembers ? visible.length : MEMBER_LIST_CAP, visible.length)} of {visible.length} members
            </span>
            {visible.length > MEMBER_LIST_CAP && (
              <button
                onClick={() => setShowAllMembers(v => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--info)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                {showAllMembers ? 'Show less' : 'View all members'}
              </button>
            )}
          </div>
        </Card>

        {/* Right: detail panel */}
        {selected ? (
          <DetailPanel member={selected} dateISO={dateISO} />
        ) : (
          <Card style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Select a team member to see details.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
