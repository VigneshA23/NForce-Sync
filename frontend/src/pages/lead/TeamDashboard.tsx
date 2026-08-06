import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Ban, Calendar, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList,
  Download, Flag, Gauge, Hourglass, Loader2, RefreshCw, Scale,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  LineChart, Line, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { todayISO as localTodayISO } from '../../lib/date';
import { getEntry } from '../../api/eod';
import { usePendingApprovalsCount } from '../../api/approvals';
import { readStoredDateFilter, resolveTeamDashboardDateFilter, writeStoredDateFilter } from '../../lib/teamDashboardDateFilter';
import {
  useTeamLeadBlockers, useTeamLeadSummary, useTeamLeadTrend, useTeamMemberStatuses,
  type DateRange, type MemberEodStatus, type MemberEodStatusDto, type TeamBlockerDto, type TeamLeadSummaryDto,
  type TrendPointDto,
} from '../../api/teamLead';

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

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function rangeLabel(range: DateRange, fmt: (iso: string) => string): string {
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
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

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, ...style }}>
      {children}
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: `color-mix(in srgb, ${color} 22%, var(--raised2))`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif',
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

// ── KPI card w/ sparkline ─────────────────────────────────────────────────────────

function KpiSparkline({ points, color }: { points: (number | null)[]; color: string }) {
  const data = points.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 84, height: 42 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({
  icon: Icon, accent, label, value, deltaIcon: DeltaIcon, deltaText, deltaColor, sparkline,
}: {
  icon: LucideIcon; accent: string; label: string; value: React.ReactNode;
  deltaIcon: LucideIcon; deltaText: string; deltaColor: string; sparkline: (number | null)[];
}) {
  return (
    <Card style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7, marginBottom: 12,
            background: `color-mix(in srgb, ${accent} 18%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          }}>
            <Icon size={15} aria-hidden="true" />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, whiteSpace: 'nowrap' }}>
            {label}
          </div>
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 25, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: deltaColor, whiteSpace: 'nowrap' }}>
            <DeltaIcon size={11} aria-hidden="true" />
            {deltaText}
          </div>
        </div>
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          <KpiSparkline points={sparkline} color={accent} />
        </div>
      </div>
    </Card>
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
            <div style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-mut)', whiteSpace: 'nowrap' }}>
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
          display: 'grid', gridTemplateColumns: '1.8fr 1.4fr 110px', gap: 12, alignItems: 'center',
          padding: '12px 20px', cursor: clickable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={member.fullName} color={color} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {member.fullName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
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
            <span style={{ fontWeight: 600 }}>{b.employeeName}</span>
            {' — '}
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
            tick={{ fontSize: 10, fill: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
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
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--txt)' }}>{total}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>Total</div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>{s.label}</span>
            <span style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
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
        <span style={{ fontSize: 13, color: 'var(--txt-dim)' }}>Non-working day — no utilization data</span>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
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
          <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--txt)' }}>{fmtPct(avg)}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>Avg Utilization</div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {buckets.map(b => (
          <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--txt-mut)' }}>{b.label}</span>
            <span style={{ fontSize: 12, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────────

function QuickActionTile({ icon: Icon, accent, title, subtitle, onClick, disabled }: {
  icon: LucideIcon; accent: string; title: string; subtitle: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Not available yet' : undefined}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
        padding: 14, borderRadius: 9, textAlign: 'left',
        background: 'var(--raised2)', border: '1px solid var(--line)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: `color-mix(in srgb, ${accent} 18%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
      }}>
        <Icon size={14} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{subtitle}</div>
    </button>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────────────

const ROSTER_COLLAPSED_COUNT = 6;
const BLOCKERS_COLLAPSED_COUNT = 2;

function agoLabel(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

export default function TeamDashboard() {
  const navigate = useNavigate();
  const todayISO = localTodayISO();

  // Selected date/range lives in the URL (?mode=today|yesterday|range&from=&to=) so it survives
  // navigation within the session, is shareable/bookmarkable, and only ever changes on an
  // explicit user action — never as a side effect of remounting this page.
  const [searchParams, setSearchParams] = useSearchParams();

  const { mode, range, isToday } = resolveTeamDashboardDateFilter(searchParams);

  useEffect(() => {
    if (searchParams.get('mode')) return;
    const saved = readStoredDateFilter();
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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(todayISO);
  const [draftTo, setDraftTo] = useState(todayISO);

  const anchorDate = range.to;
  const dateSelectorLabel = mode === 'today' ? `Today, ${fmtShortDate(todayISO)}` : mode === 'yesterday' ? `Yesterday, ${fmtShortDate(range.from)}` : rangeLabel(range, fmtShortDate);
  const panelRangeLabel = mode === 'today' ? 'Today' : mode === 'yesterday' ? 'Yesterday' : 'Custom Range';

  function selectQuick(kind: 'today' | 'yesterday') {
    const next = new URLSearchParams(searchParams);
    next.set('mode', kind);
    next.delete('from');
    next.delete('to');
    setSearchParams(next, { replace: true });
    writeStoredDateFilter({ mode: kind });
    setPickerOpen(false);
  }

  function applyRange() {
    if (draftFrom > draftTo) return;
    const next = new URLSearchParams(searchParams);
    next.set('mode', 'range');
    next.set('from', draftFrom);
    next.set('to', draftTo);
    setSearchParams(next, { replace: true });
    writeStoredDateFilter({ mode: 'range', from: draftFrom, to: draftTo });
    setPickerOpen(false);
  }

  function openPicker() {
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setPickerOpen(true);
  }

  const {
    data: summary, isPending: summaryPending, isFetching: summaryFetching, isError: summaryError,
    refetch: refetchSummary, dataUpdatedAt,
  } = useTeamLeadSummary(range, isToday);
  const { data: members, isPending: membersPending, isFetching: membersFetching, isError: membersError, refetch: refetchMembers } = useTeamMemberStatuses(range, isToday);
  const { data: blockers, isPending: blockersPending, isFetching: blockersFetching } = useTeamLeadBlockers(range, isToday);
  const { data: trend, isPending: trendPending } = useTeamLeadTrend(anchorDate, 7);

  // Shared cache with the sidebar badge and Approvals page (see usePendingApprovalsCount's own
  // doc comment) — scoped to the dashboard's own selected `range` so the "Review approvals"
  // button and this KPI card reflect only that window. Shell.tsx resolves this same range from
  // the URL independently (only while the current route is the Team Dashboard) so the sidebar
  // badge asks the exact same question and can never disagree with what's shown here.
  const pendingApprovalsCount = usePendingApprovalsCount(true, range);

  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [blockersExpanded, setBlockersExpanded] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Collapse the roster and blockers list back to their default row counts whenever the
  // selected date/range changes (a fresh load already starts collapsed via the initial
  // state above).
  useEffect(() => {
    setRosterExpanded(false);
    setBlockersExpanded(false);
  }, [range.from, range.to]);

  const sortedMembers = useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  }, [members]);

  const visibleMembers = rosterExpanded ? sortedMembers : sortedMembers.slice(0, ROSTER_COLLAPSED_COUNT);

  const topOverloaded = useMemo(() => {
    const overloaded = (members ?? []).filter(m => m.overloaded);
    if (overloaded.length === 0) return null;
    return overloaded.reduce((a, b) => (b.utilizationPct ?? 0) > (a.utilizationPct ?? 0) ? b : a);
  }, [members]);

  const isPending = summaryPending || membersPending;
  const isError = summaryError || membersError;
  const isRefreshing = !isPending && (summaryFetching || membersFetching || blockersFetching);

  if (isPending) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <Skel h={24} w={220} />
          <div style={{ marginTop: 8 }}><Skel h={14} w={280} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <Card key={i} style={{ padding: '1rem' }}>
              <Skel h={30} w={30} />
              <div style={{ marginTop: 12 }}><Skel h={22} w={60} /></div>
              <div style={{ marginTop: 8 }}><Skel h={12} w={90} /></div>
            </Card>
          ))}
        </div>
        <Card style={{ padding: 20 }}><Skel h={260} /></Card>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Team Lead Dashboard</h1>
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
  const sparklineFor = (series: TrendPointDto[] | undefined) => (series ?? []).map(p => p.value);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Team Lead Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            Overview of your team's productivity and status
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
                color: 'var(--txt)', background: 'var(--raised)', border: '1px solid var(--line)', borderRadius: 8,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Calendar size={13} aria-hidden="true" />
              {dateSelectorLabel}
              {isRefreshing
                ? <Loader2 size={12} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
                : <ChevronDown size={12} aria-hidden="true" />}
            </button>

            {pickerOpen && (
              <>
                <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 260,
                  background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button
                      onClick={() => selectQuick('today')}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                        background: mode === 'today' ? 'var(--info)' : 'var(--raised2)',
                        color: mode === 'today' ? '#fff' : 'var(--txt)',
                        border: '1px solid var(--line2)',
                      }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => selectQuick('yesterday')}
                      style={{
                        flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                        background: mode === 'yesterday' ? 'var(--info)' : 'var(--raised2)',
                        color: mode === 'yesterday' ? '#fff' : 'var(--txt)',
                        border: '1px solid var(--line2)',
                      }}
                    >
                      Yesterday
                    </button>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Custom range
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <input
                      type="date" value={draftFrom} max={todayISO}
                      onChange={(e) => setDraftFrom(e.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>to</span>
                    <input
                      type="date" value={draftTo} max={todayISO}
                      onChange={(e) => setDraftTo(e.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)' }}
                    />
                  </div>
                  {draftFrom > draftTo && (
                    <div style={{ fontSize: 11, color: 'var(--risk)', marginBottom: 10 }}>"From" must not be after "to".</div>
                  )}
                  <button
                    onClick={applyRange}
                    disabled={draftFrom > draftTo}
                    style={{
                      width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                      background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                      cursor: draftFrom > draftTo ? 'default' : 'pointer', opacity: draftFrom > draftTo ? 0.6 : 1,
                    }}
                  >
                    Apply
                  </button>
                </div>
              </>
            )}
          </div>

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

      {/* KPI row — 5 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiCard
          icon={Gauge} accent="var(--warn)" label="Team Utilization" value={avgUtilLabel}
          deltaIcon={utilDelta !== null && utilDelta < 0 ? ArrowDown : ArrowUp}
          deltaText={utilDelta === null ? 'vs yesterday: —' : `${utilDelta >= 0 ? '+' : ''}${utilDelta} pts vs yesterday`}
          deltaColor="var(--warn)"
          sparkline={trendPending ? [] : sparklineFor(trend?.avgUtilization)}
        />
        <KpiCard
          icon={ClipboardCheck} accent="var(--warn)" label="Submitted Today" value={submittedTodayValue}
          deltaIcon={ArrowDown}
          deltaText={`${summary.missingCount} missing`}
          deltaColor="var(--risk)"
          sparkline={trendPending ? [] : sparklineFor(trend?.submittedCount)}
        />
        <KpiCard
          icon={Hourglass} accent="var(--risk)" label="Pending Approval" value={pendingApprovalsCount}
          deltaIcon={pendingDelta !== null && pendingDelta < 0 ? ArrowDown : ArrowUp}
          deltaText={pendingDelta === null ? '—' : `${pendingDelta >= 0 ? '+' : ''}${pendingDelta}`}
          deltaColor="var(--risk)"
          sparkline={trendPending ? [] : sparklineFor(trend?.pendingApprovalCount)}
        />
        <KpiCard
          icon={Scale} accent="var(--ok)" label="Over-allocated" value={summary.overloadedCount}
          deltaIcon={ArrowUp}
          deltaText={topOverloaded ? `${topOverloaded.fullName.split(' ')[0]} ${fmtPct(topOverloaded.utilizationPct)}` : 'None'}
          deltaColor="var(--ok)"
          // TODO(backend): no trend series exists for overloaded-member-count over time
          // (DashboardTrendDto has no such field) — placeholder flat sparkline until it does.
          sparkline={[summary.overloadedCount, summary.overloadedCount, summary.overloadedCount, summary.overloadedCount, summary.overloadedCount, summary.overloadedCount, summary.overloadedCount]}
        />
        <KpiCard
          icon={Ban} accent="var(--info)" label="Open Blockers" value={blockers ? blockers.length : summary.activeBlockersCount}
          deltaIcon={blockersDelta !== null && blockersDelta > 0 ? ArrowUp : ArrowDown}
          deltaText={blockersDelta === null ? '—' : `${blockersDelta >= 0 ? '+' : ''}${blockersDelta}`}
          deltaColor="var(--info)"
          sparkline={trendPending ? [] : sparklineFor(trend?.blockersCount)}
        />
      </div>

      {/* Mid section: Team Status table + right stack */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Team Status</div>
            <button
              onClick={() => navigate('/team/utilization')}
              style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              View Utilization <ChevronRight size={12} aria-hidden="true" />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.4fr 110px', gap: 12, padding: '8px 20px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
          {sortedMembers.length > ROSTER_COLLAPSED_COUNT && (
            <div style={{ padding: '12px 20px', textAlign: 'center', borderTop: '1px solid var(--line)' }}>
              <button
                onClick={() => setRosterExpanded(e => !e)}
                style={{ fontSize: 12, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {rosterExpanded ? 'Show less' : 'View all members'}
                {rosterExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
              </button>
            </div>
          )}
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
        </div>
      </div>

      {/* Bottom row: 3 panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Status Distribution</div>
            {/* No per-panel week filter exists yet — mirrors the header's selected range. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-dim)' }}>
              {panelRangeLabel} <ChevronDown size={11} aria-hidden="true" />
            </span>
          </div>
          <StatusDistributionDonut summary={summary} />
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Utilization Overview</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-dim)' }}>
              {panelRangeLabel} <ChevronDown size={11} aria-hidden="true" />
            </span>
          </div>
          <UtilizationOverviewRing summary={summary} />
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 14 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <QuickActionTile
              icon={ClipboardList} accent="var(--brand)" title="Review Approvals"
              subtitle={`${summary.pendingApprovalCount} pending`}
              onClick={() => navigate('/team/approvals')}
            />
            <QuickActionTile
              icon={Ban} accent="var(--risk)" title="View Blockers"
              subtitle={`${blockers ? blockers.length : summary.activeBlockersCount} open`}
              onClick={() => navigate('/team/blockers')}
            />
            <QuickActionTile
              icon={Gauge} accent="var(--info)" title="Team Utilization"
              subtitle="Detailed report"
              onClick={() => navigate('/team/utilization')}
            />
            <QuickActionTile
              icon={Download} accent="var(--ok)" title="Export Report"
              subtitle="Download" disabled
            />
          </div>
        </Card>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--txt-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <RefreshCw size={11} aria-hidden="true" />
        Last updated: {agoLabel(nowTick - dataUpdatedAt)}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
