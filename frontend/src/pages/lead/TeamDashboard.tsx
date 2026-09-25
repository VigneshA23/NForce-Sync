import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Ban, ChevronDown, ChevronRight, ClipboardCheck,
  Flag, Gauge, Hourglass, Scale,
} from 'lucide-react';
import { DateRangeSelector } from '../../components/DateRangeSelector';
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { todayISO as localTodayISO, formatDateShort, formatDateRange } from '../../lib/date';
import { useAuth } from '../../lib/auth';
import { getEntry } from '../../api/eod';
import { usePendingApprovalsCount } from '../../api/approvals';
import { readStoredDateFilter, resolveTeamDashboardDateFilter, writeStoredDateFilter } from '../../lib/teamDashboardDateFilter';
import {
  useTeamLeadBlockers, useTeamLeadSummary, useTeamLeadTrend, useTeamMemberStatuses,
  type MemberEodStatus, type MemberEodStatusDto, type TeamBlockerDto, type TeamLeadSummaryDto,
  type TrendPointDto,
} from '../../api/teamLead';
import { ReporteeScopePicker } from '../../components/ReporteeScopePicker';
import { GlobalLoader } from '../../components/GlobalLoader';
import { Card, KpiCard, ClickableKpi } from '../../components/KpiCard';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { Pagination } from '../../components/Pagination';

// ── status config ──────────────────────────────────────────────────────────────
// SUBMITTED here means the entry has been through review and is APPROVED (backend
// naming quirk — see UtilizationService/TeamLeadService.resolveStatus) — "Approved" is
// the correct user-facing label. The reference mock labels this pill "Submitted"; kept as
// "Approved" here deliberately (see comment above) rather than reintroducing that leak.

const STATUS_CFG: Record<MemberEodStatus, { color: string; label: string }> = {
  SUBMITTED:         { color: 'var(--ok)',   label: 'Approved' },
  PENDING_APPROVAL:  { color: 'var(--warn)', label: 'Pending' },
  MISSING:           { color: 'var(--risk)', label: 'Missing' },
  ON_LEAVE:          { color: 'var(--info)', label: 'On Leave' },
};

// Missing -> Pending Approval -> Submitted -> On Leave
const STATUS_PRIORITY: Record<MemberEodStatus, number> = {
  MISSING: 0, PENDING_APPROVAL: 1, SUBMITTED: 2, ON_LEAVE: 3,
};

function fmtPct(pct: number | null): string {
  return pct === null ? '—' : `${Math.round(pct)}%`;
}

// "52.3" open hours -> "2d 4h". Same unit (openHours) the app already uses elsewhere for
// blocker age — just formatted for display instead of compared against a threshold.
function formatOpenHours(hours: number): string {
  const total = Math.floor(hours);
  const days = Math.floor(total / 24);
  const rem = total % 24;
  if (days === 0) return `${rem}h`;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

// ── primitives (local — matches the per-page Card convention used across lead pages) ──

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: `color-mix(in srgb, ${color} 22%, var(--raised2))`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    }}>
      {initials}
    </div>
  );
}

function StatusPill({ status }: { status: MemberEodStatus }) {
  const { color, label } = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 5,
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      color, fontSize: 11, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

// ── member detail (inline expand) ────────────────────────────────────────────────

function MemberDetail({ eodEntryId }: { eodEntryId: number }) {
  const { data, isPending } = useQuery({
    queryKey: ['eod', 'entry', eodEntryId],
    queryFn: () => getEntry(eodEntryId),
  });

  if (isPending) return <div style={{ padding: '4px 16px 12px 58px' }}><Skel h={13} w="60%" /></div>;
  if (!data) return null;

  return (
    <div style={{ padding: '0 16px 14px 58px' }}>
      {data.tasks.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No tasks logged.</div>
      ) : (
        data.tasks.map(t => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--txt)', marginBottom: 2 }}>
                {t.description || '—'}
                {t.categoryName && <span style={{ color: 'var(--txt-dim)' }}> · {t.categoryName}</span>}
              </div>
              {t.blockerReason && <div style={{ fontSize: 11, color: 'var(--risk)' }}>Blocker: {t.blockerReason}</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt-mut)', whiteSpace: 'nowrap' }}>
              {t.hours != null ? `${t.hours}h` : '—'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── project cell (truncated, full list via native tooltip) ───────────────────────

function ProjectsCell({ names }: { names: string[] }) {
  if (names.length === 0) {
    return <span style={{ fontSize: 13, color: 'var(--txt-mut)' }}>—</span>;
  }
  return (
    <div style={{ fontSize: 13, color: 'var(--txt-mut)', lineHeight: 1.4 }}>
      {names.join(', ')}
    </div>
  );
}

// ── Team Status table row ─────────────────────────────────────────────────────────

function MemberRow({ member, isLast, expanded, onToggle, onOpenApproval }: {
  member: MemberEodStatusDto; isLast: boolean; expanded: boolean; onToggle: () => void;
  onOpenApproval: (eodEntryId: number) => void;
}) {
  const { color } = STATUS_CFG[member.status];
  const hasEntry = member.eodEntryId != null;
  // A pending entry needs the Team Lead to actually act on it (approve/reject/request
  // changes) — that only happens on the Approvals page, so clicking it navigates there
  // (highlighted) instead of expanding an inline, read-only task list.
  const isPending = member.status === 'PENDING_APPROVAL';
  const canExpand = hasEntry && !isPending;
  const canOpenApproval = hasEntry && isPending;
  const clickable = canExpand || canOpenApproval;

  function handleClick() {
    if (canOpenApproval) onOpenApproval(member.eodEntryId!);
    else if (canExpand) onToggle();
  }

  return (
    <div style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--line)' }}>
      <div
        onClick={clickable ? handleClick : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter') handleClick(); } : undefined}
        style={{
          display: 'grid', gridTemplateColumns: ROSTER_TABLE_COLUMNS, gap: 12, alignItems: 'center',
          padding: '12px 20px', cursor: clickable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={member.fullName} color={color} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {member.fullName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>
              {member.employeeCode}
            </div>
          </div>
        </div>
        <ProjectsCell names={member.projectNames} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <StatusPill status={member.status} />
          {canExpand && (expanded
            ? <ChevronDown size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
            : <ChevronRight size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />)}
          {canOpenApproval && <ChevronRight size={13} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />}
        </div>
      </div>
      {expanded && canExpand && <MemberDetail eodEntryId={member.eodEntryId!} />}
    </div>
  );
}

// ── Blockers Today row ────────────────────────────────────────────────────────────

function BlockerRow({ b, isLast, flagged, onView }: {
  b: TeamBlockerDto; isLast: boolean; flagged: boolean; onView: () => void;
}) {
  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--line)', padding: '12px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0, marginTop: 1,
          background: 'var(--raised2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: flagged ? 'var(--risk)' : 'var(--warn)',
        }}>
          {flagged ? <Ban size={14} aria-hidden="true" /> : <Flag size={14} aria-hidden="true" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.4, marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{b.employeeName}:</span>
            {' '}
            <span style={{ color: 'var(--txt-mut)' }}>{b.blockerReason ?? b.description ?? 'No detail provided'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--txt-dim)' }}>
            <span>Since {formatOpenHours(b.openHours)}</span>
          </div>
        </div>
        <button
          onClick={onView}
          style={{
            padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, flexShrink: 0,
            background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', cursor: 'pointer',
          }}
        >
          View
        </button>
      </div>
    </div>
  );
}

// ── 7-day utilization area chart ──────────────────────────────────────────────────

function WeeklyUtilChart({ points }: { points: TrendPointDto[] }) {
  const data = points.map(p => ({
    day: new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }),
    value: p.value != null ? Math.round(p.value) : null,
    workingDay: p.workingDay,
  }));

  const CustomDot = (props: { cx?: number; cy?: number; payload?: { value: number | null } }) => {
    const { cx, cy, payload } = props;
    const value = payload?.value;
    if (value == null || cx == null || cy == null) return <g />;
    return (
      <g>
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--txt-mut)">
          {value}%
        </text>
        <circle cx={cx} cy={cy} r={4} fill="var(--risk)" stroke="var(--panel)" strokeWidth={2} />
      </g>
    );
  };

  // Dims the day label for non-working days (weekend/company holiday). The line still
  // bridges over them (connectNulls, below) so the trend reads as one continuous series,
  // but those points never get a dot or a computed percentage — the axis is what marks
  // them as distinct from a real 0%.
  const XAxisTick = (props: { x?: number; y?: number; payload?: { value: string }; index?: number }) => {
    const { x, y, payload, index } = props;
    if (x == null || y == null || payload == null || index == null) return <g />;
    const isWorkingDay = data[index]?.workingDay !== false;
    return (
      <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill="var(--txt-dim)" opacity={isWorkingDay ? 1 : 0.45}>
        {payload.value}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { payload: { value: number | null; workingDay: boolean } }[]; label?: string }) => {
    if (!active || !label) return null;
    // A non-working day has no dot/value of its own (CustomDot skips it), so Recharts can
    // report an empty payload there even though the bridged line passes through its x
    // position — fall back to the day's own record instead of bailing out silently, so
    // hovering Sat/Sun/a holiday still says why there's no value.
    const point = payload?.[0]?.payload ?? data.find(d => d.day === label);
    if (!point) return null;
    return (
      <div style={{ background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 7, fontSize: 12, padding: '6px 10px' }}>
        <div style={{ color: 'var(--txt-mut)', marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'var(--txt)' }}>
          {point.workingDay === false ? 'Non-working day' : `${point.value}% Utilization`}
        </div>
      </div>
    );
  };

  if (data.every(d => d.value == null)) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--txt-dim)' }}>No utilization data in this range</span>
      </div>
    );
  }

  // Utilization is uncapped server-side (a member can be well over 100%) — a fixed [0,100]
  // domain would silently clip any day above it. Scale to whatever the data actually needs.
  const maxValue = Math.max(100, ...data.map(d => d.value ?? 0));
  const axisMax = Math.ceil(maxValue / 25) * 25;
  const axisTicks = Array.from({ length: axisMax / 25 + 1 }, (_, i) => i * 25);

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="weeklyUtilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--risk)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--risk)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="day" tick={<XAxisTick />} tickLine={false} axisLine={false} />
          <YAxis
            domain={[0, axisMax]} ticks={axisTicks}
            tick={{ fontSize: 10, fill: 'var(--txt-dim)' }}
            tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone" dataKey="value"
            stroke="var(--risk)" strokeWidth={2} fill="url(#weeklyUtilGrad)"
            connectNulls dot={<CustomDot />} activeDot={{ r: 5, fill: 'var(--risk)' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Status Distribution donut ─────────────────────────────────────────────────────

function StatusDistributionDonut({ summary }: { summary: TeamLeadSummaryDto }) {
  const segments = [
    { key: 'approved', color: 'var(--ok)',   label: 'Approved',       count: summary.submittedCount },
    { key: 'pending',  color: 'var(--warn)', label: 'Pending Approval', count: summary.pendingApprovalCount },
    { key: 'missing',  color: 'var(--risk)', label: 'Missing',        count: summary.missingCount },
    { key: 'leave',    color: 'var(--info)', label: 'On Leave',       count: summary.onLeaveCount },
  ];
  const total = summary.activeMembers;
  const data = segments.filter(s => s.count > 0).map(s => ({ name: s.label, value: s.count, color: s.color }));

  return (
    <div className="nf-r-donut-row" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ width: 130, height: 130, flexShrink: 0, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--txt)' }}>{total}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>Total</div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>{s.label}</span>
            <span style={{ fontSize: 12, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
              {s.count} <span style={{ color: 'var(--txt-dim)' }}>({total > 0 ? Math.round((s.count / total) * 100) : 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Utilization Overview ring ─────────────────────────────────────────────────────

function UtilizationOverviewRing({ summary }: { summary: TeamLeadSummaryDto }) {
  // Weekends/company holidays never have real per-member utilization (see TeamLeadService/
  // UtilizationService.isWorkingDay) — underutilizedCount and overloadedCount are both 0 on
  // those days simply because nothing was computed, not because everyone is "Optimal".
  // Showing the ring as if 100% of the team is optimal would be exactly the false-positive
  // this component exists to avoid, so render a distinct non-working-day state instead.
  if (!summary.workingDay) {
    return (
      <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Non-working day, no utilization data</span>
      </div>
    );
  }

  const avg = summary.avgUtilization;

  const optimalCount = Math.max(summary.activeMembers - summary.underutilizedCount - summary.overloadedCount, 0);
  // The Pie is bound directly to this same array the legend renders below — no separate/
  // derived dataset — so a 0-count bucket is a 0-value slice (Recharts renders it as zero
  // arc length) and every other slice's arc is exactly count/total, matching the legend.
  const buckets = [
    { key: 'under',   color: 'var(--warn)', label: `Underutilized (<${summary.thresholds.underutilizedPct}%)`, count: summary.underutilizedCount },
    { key: 'optimal', color: 'var(--ok)',   label: `Optimal (${summary.thresholds.underutilizedPct}% – ${summary.thresholds.overloadedPct}%)`, count: optimalCount },
    { key: 'over',    color: 'var(--risk)', label: `Overutilized (>${summary.thresholds.overloadedPct}%)`, count: summary.overloadedCount },
  ];

  return (
    <div className="nf-r-donut-row" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ width: 130, height: 130, flexShrink: 0, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={buckets} cx="50%" cy="50%" innerRadius={40} outerRadius={58} startAngle={90} endAngle={-270} paddingAngle={0} dataKey="count" strokeWidth={0}>
              {buckets.map(b => <Cell key={b.key} fill={b.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--txt)' }}>{fmtPct(avg)}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>Avg Utilization</div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {buckets.map(b => (
          <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>{b.label}</span>
            <span style={{ fontSize: 12, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────────────

const ROSTER_PAGE_SIZE = 6;
const BLOCKERS_COLLAPSED_COUNT = 2;

// Roster table — header row and body rows must share one template or the
// columns desync. Min width stays under the desktop content width.
const ROSTER_TABLE_COLUMNS = '1.8fr 1.4fr 110px';
const ROSTER_TABLE_MIN_WIDTH = 520;

export default function TeamDashboard() {
  const navigate = useNavigate();
  const todayISO = localTodayISO();
  const { user } = useAuth();
  const userId = user!.id;
  const isSuperAdmin = user!.role === 'superadmin';
  // Super Admin-only "view as Team Lead" scope (Reportee Views enhancement) — always null for
  // an actual Team Lead, who never sees the picker that sets it.
  const [teamLeadId, setTeamLeadId] = useState<number | null>(null);

  // Selected date/range lives in the URL (?mode=today|yesterday|range&from=&to=) so it survives
  // navigation within the session, is shareable/bookmarkable, and only ever changes on an
  // explicit user action — never as a side effect of remounting this page.
  const [searchParams, setSearchParams] = useSearchParams();

  const { mode, range, isToday } = resolveTeamDashboardDateFilter(searchParams, userId);

  useEffect(() => {
    if (searchParams.get('mode')) return;
    const saved = readStoredDateFilter(userId);
    if (!saved) return;
    const next = new URLSearchParams(searchParams);
    next.set('mode', saved.mode);
    if (saved.mode === 'range' && saved.from && saved.to) {
      next.set('from', saved.from);
      next.set('to', saved.to);
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anchorDate = range.to;
  const dateSelectorLabel = mode === 'today' ? `Today, ${formatDateShort(todayISO)}` : mode === 'yesterday' ? `Yesterday, ${formatDateShort(range.from)}` : formatDateRange(range);
  const panelRangeLabel = mode === 'today' ? 'Today' : mode === 'yesterday' ? 'Yesterday' : 'Custom Range';

  function selectQuick(kind: 'today' | 'yesterday') {
    const next = new URLSearchParams(searchParams);
    next.set('mode', kind);
    next.delete('from');
    next.delete('to');
    setSearchParams(next, { replace: true });
    writeStoredDateFilter(userId, { mode: kind });
  }

  function applyRange(from: string, to: string) {
    const next = new URLSearchParams(searchParams);
    next.set('mode', 'range');
    next.set('from', from);
    next.set('to', to);
    setSearchParams(next, { replace: true });
    writeStoredDateFilter(userId, { mode: 'range', from, to });
  }

  const {
    data: summary, isPending: summaryPending, isFetching: summaryFetching, isError: summaryError,
    refetch: refetchSummary,
  } = useTeamLeadSummary(range, isToday, true, teamLeadId);
  const { data: members, isPending: membersPending, isFetching: membersFetching, isError: membersError, refetch: refetchMembers } = useTeamMemberStatuses(range, isToday, teamLeadId);
  const { data: blockers, isPending: blockersPending, isFetching: blockersFetching } = useTeamLeadBlockers(range, isToday, false, teamLeadId);
  const { data: trend, isPending: trendPending } = useTeamLeadTrend(anchorDate, 7, teamLeadId);

  // Shared cache with the sidebar badge and Approvals page (see usePendingApprovalsCount's own
  // doc comment) — scoped to the dashboard's own selected `range` so the "Review approvals"
  // button and this KPI card reflect only that window. Shell.tsx resolves this same range from
  // the URL independently (only while the current route is the Team Dashboard) so the sidebar
  // badge asks the exact same question and can never disagree with what's shown here.
  const pendingApprovalsCount = usePendingApprovalsCount(true, range);

  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [rosterPage, setRosterPage] = useState(1);
  const [blockersExpanded, setBlockersExpanded] = useState(false);

  // Reset the roster back to page 1 and collapse the blockers list back to its default row
  // count whenever the selected date/range changes (a fresh load already starts this way via
  // the initial state above).
  useEffect(() => {
    setRosterPage(1);
    setBlockersExpanded(false);
  }, [range.from, range.to]);

  const sortedMembers = useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  }, [members]);

  const rosterTotalPages = Math.max(1, Math.ceil(sortedMembers.length / ROSTER_PAGE_SIZE));
  const rosterPageSafe = Math.min(rosterPage, rosterTotalPages);

  const visibleMembers = sortedMembers.slice((rosterPageSafe - 1) * ROSTER_PAGE_SIZE, rosterPageSafe * ROSTER_PAGE_SIZE);

  const topOverloaded = useMemo(() => {
    const overloaded = (members ?? []).filter(m => m.overloaded);
    if (overloaded.length === 0) return null;
    return overloaded.reduce((a, b) => (b.utilizationPct ?? 0) > (a.utilizationPct ?? 0) ? b : a);
  }, [members]);

  const isPending = summaryPending || membersPending;
  const isError = summaryError || membersError;
  const isRefreshing = !isPending && (summaryFetching || membersFetching || blockersFetching);

  if (isPending) {
    return <GlobalLoader fullScreen={false} />;
  }

  if (isError || !summary) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Team Lead Dashboard</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load dashboard.</div>
          <button
            onClick={() => { refetchSummary(); refetchMembers(); }}
            style={{ padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const submittedTodayValue = `${summary.submittedCount + summary.pendingApprovalCount}/${summary.activeMembers}`;
  const avgUtilLabel = fmtPct(summary.avgUtilization);

  const flaggedBlockerIds = new Set(
    (blockers ?? []).filter(b => !b.acknowledged && b.openHours > summary.thresholds.blockerAgeAlertHours).map(b => b.taskId),
  );

  // Deltas: last point in the anchor-ending 7-day trend is the selected day itself;
  // second-to-last is the day before it (TeamLeadService.getTrend returns oldest→newest,
  // ending at the requested date) — so "today - yesterday" is just the last two points.
  function delta(series: TrendPointDto[] | undefined): number | null {
    if (!series || series.length < 2) return null;
    const last = series[series.length - 1]?.value;
    const prev = series[series.length - 2]?.value;
    if (last == null || prev == null) return null;
    return Math.round(last - prev);
  }

  const utilDelta = delta(trend?.avgUtilization);
  const pendingDelta = delta(trend?.pendingApprovalCount);
  const blockersDelta = delta(trend?.blockersCount);

  return (
    <div>
      {isSuperAdmin && (
        <ReporteeScopePicker role="MANAGER" label="Team Lead" value={teamLeadId} onChange={setTeamLeadId} />
      )}
      {/* Header controls — date filter + review-approvals action */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DateRangeSelector
            mode={mode} range={range} todayISO={todayISO} label={dateSelectorLabel}
            onSelectQuick={selectQuick} onApplyRange={applyRange} isRefreshing={isRefreshing}
          />

          <button
            onClick={() => navigate(`/team/approvals?from=${range.from}&to=${range.to}`)}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8,
              background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Review approvals ({pendingApprovalsCount})
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <HeroBanner subtitle="Overview of your team's productivity and status" />
      </div>

      {/* KPI tiles — own full-width row below the hero/quick-actions row. */}
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <ClickableKpi onClick={() => navigate('/team/utilization')}>
            <KpiCard
              icon={<Gauge size={18} />} accent="var(--warn)" label="Team Utilization" value={avgUtilLabel}
              trend={utilDelta === null ? undefined : {
                label: `${utilDelta >= 0 ? '+' : ''}${utilDelta} pts vs yesterday`,
                positive: utilDelta >= 0,
              }}
            />
          </ClickableKpi>
          <ClickableKpi onClick={() => navigate('/team/eod-inbox')}>
            <KpiCard
              icon={<ClipboardCheck size={18} />} accent="var(--warn)" label="Submitted Today" value={submittedTodayValue}
              trend={{ label: `${summary.missingCount} missing`, positive: summary.missingCount === 0 }}
            />
          </ClickableKpi>
          <ClickableKpi onClick={() => navigate('/team/approvals')}>
            <KpiCard
              icon={<Hourglass size={18} />} accent="var(--risk)" label="Pending Approval" value={pendingApprovalsCount}
              trend={pendingDelta === null ? undefined : {
                label: `${pendingDelta >= 0 ? '+' : ''}${pendingDelta} vs yesterday`,
                positive: pendingDelta <= 0,
              }}
            />
          </ClickableKpi>
          <ClickableKpi onClick={() => navigate('/team/utilization?status=over')}>
            <KpiCard
              icon={<Scale size={18} />} accent="var(--ok)" label="Over-allocated" value={summary.overloadedCount}
              trend={{
                label: topOverloaded ? `${topOverloaded.fullName.split(' ')[0]} ${fmtPct(topOverloaded.utilizationPct)}` : 'None',
                positive: !topOverloaded,
              }}
            />
          </ClickableKpi>
          <ClickableKpi onClick={() => navigate('/team/blockers')}>
            <KpiCard
              icon={<Ban size={18} />} accent="var(--info)" label="Open Blockers" value={blockers ? blockers.length : summary.activeBlockersCount}
              trend={blockersDelta === null ? undefined : {
                label: `${blockersDelta >= 0 ? '+' : ''}${blockersDelta} vs yesterday`,
                positive: blockersDelta <= 0,
              }}
            />
          </ClickableKpi>
      </div>

      {/* Mid section: Team Status table + right stack. Stretch (the grid default, so no
          alignItems override) rather than start-aligned: Team Status and the Blockers
          Today/Team Utilization stack next to it rarely have the same natural height, and
          start-aligning left whichever is shorter ending well above the taller one, exposing
          bare shell background beside it. Both sides get a trailing flex:1 spacer as their
          last child so the extra stretched height lands there instead of distorting a real
          card or opening a gap between visible content and its own footer. */}
      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Team Status</div>
            <button
              onClick={() => navigate('/team/utilization')}
              style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              View Utilization <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>
          {/* Header and rows share one scroll region so columns stay aligned
              while swiping; the pagination footer sits outside it. */}
          <div className="nf-r-scroll">
          <div className="nf-r-scroll-inner" style={{ '--nf-r-min': ROSTER_TABLE_MIN_WIDTH + 'px' } as React.CSSProperties}>
          <div style={{ display: 'grid', gridTemplateColumns: ROSTER_TABLE_COLUMNS, gap: 12, padding: '8px 20px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Employees</span>
            <span>Project</span>
            <span style={{ textAlign: 'right' }}>Status</span>
          </div>
          {sortedMembers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>No team members assigned yet.</div>
          ) : (
            visibleMembers.map((m, i) => (
              <MemberRow
                key={m.id}
                member={m}
                isLast={i === visibleMembers.length - 1}
                expanded={expandedMemberId === m.id}
                onToggle={() => setExpandedMemberId(id => (id === m.id ? null : m.id))}
                onOpenApproval={(eodEntryId) => navigate(`/team/approvals?from=${range.from}&to=${range.to}&highlight=${eodEntryId}`)}
              />
            ))
          )}
          </div>
          </div>
          {rosterTotalPages > 1 && (
            <Pagination
              page={rosterPageSafe} totalPages={rosterTotalPages} totalItems={sortedMembers.length}
              pageSize={ROSTER_PAGE_SIZE} onPageChange={setRosterPage} itemLabel="members"
            />
          )}
          {/* Absorbs whatever extra height this card's stretch (see the grid comment above)
              adds beyond its own rows + pagination, so that space lands below everything
              instead of as a gap between the last row and the pagination footer. */}
          <div style={{ flex: 1 }} />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Blockers Today</div>
            </div>
            {blockersPending ? (
              <div style={{ padding: 16 }}><Skel h={60} /></div>
            ) : !blockers || blockers.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
                No blockers reported.
              </div>
            ) : (
              <>
                {(blockersExpanded ? blockers : blockers.slice(0, BLOCKERS_COLLAPSED_COUNT)).map((b, i, visible) => (
                  <BlockerRow
                    key={b.taskId}
                    b={b}
                    isLast={i === visible.length - 1}
                    flagged={flaggedBlockerIds.has(b.taskId)}
                    onView={() => navigate(`/team/blockers?highlight=${b.taskId}`)}
                  />
                ))}
                {blockers.length > BLOCKERS_COLLAPSED_COUNT && (
                  <div style={{ padding: '12px 20px', textAlign: 'center', borderTop: '1px solid var(--line)' }}>
                    <button
                      onClick={() => setBlockersExpanded(e => !e)}
                      style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {blockersExpanded ? 'Show less' : 'View all'}
                      {blockersExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Team Utilization (7 Days)</div>
              <button
                onClick={() => navigate('/team/utilization')}
                style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
              >
                View full report <ChevronRight size={12} aria-hidden="true" />
              </button>
            </div>
            {trendPending ? <Skel h={220} /> : <WeeklyUtilChart points={trend?.avgUtilization ?? []} />}
          </Card>
          {/* Absorbs whatever extra height this stack's stretch (see the grid comment above)
              adds beyond its own two cards, so that space lands below both instead of
              stretching either one to an oversized, awkward height. */}
          <div style={{ flex: 1 }} />
        </div>
      </div>

      {/* Bottom row: 2 panels (Quick Actions now lives beside the KPI row above) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Status Distribution</div>
            {/* Read-only label mirroring the top date filter — this panel has no filter of its
                own, so no chevron/dropdown affordance is shown here (would misleadingly imply
                one exists). */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-dim)' }}>
              {panelRangeLabel}
            </span>
          </div>
          <StatusDistributionDonut summary={summary} />
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Utilization Overview</div>
            {/* Read-only label mirroring the top date filter — see Status Distribution above. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-dim)' }}>
              {panelRangeLabel}
            </span>
          </div>
          <UtilizationOverviewRing summary={summary} />
        </Card>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
