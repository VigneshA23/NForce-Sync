import { useState } from 'react';
import { Users, AlertCircle, Clock, Plane, Gauge } from 'lucide-react';
import { DateRangeSelector } from '../../components/DateRangeSelector';
import { Card, KpiCard } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import {
  useMyReportsSummary,
  useMyReportsMemberStatuses,
} from '../../api/myReports';
import { todayISO, formatDateShort, formatDateRange } from '../../lib/date';
import type { MemberEodStatus } from '../../api/teamLead';

// ── status config (same labels as TeamDashboard) ──────────────────────────────

const STATUS_CFG: Record<MemberEodStatus, { color: string; label: string }> = {
  SUBMITTED:        { color: 'var(--ok)',   label: 'Approved' },
  PENDING_APPROVAL: { color: 'var(--warn)', label: 'Pending' },
  MISSING:          { color: 'var(--risk)', label: 'Missing' },
  ON_LEAVE:         { color: 'var(--info)', label: 'On Leave' },
};

const STATUS_PRIORITY: Record<MemberEodStatus, number> = {
  MISSING: 0, PENDING_APPROVAL: 1, SUBMITTED: 2, ON_LEAVE: 3,
};

// ── primitives ────────────────────────────────────────────────────────────────

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

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: `color-mix(in srgb, ${color} 22%, var(--raised2))`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700,
    }}>
      {initials}
    </div>
  );
}

// ── table columns ─────────────────────────────────────────────────────────────

const TABLE_COLS = '1.8fr 1.2fr 110px 80px 60px';

// ── main ──────────────────────────────────────────────────────────────────────

export default function MyReportsOverview() {
  const today = todayISO();
  const [range, setRange] = useState({ from: today, to: today });

  type QuickMode = 'today' | 'yesterday' | 'range';
  const [mode, setMode] = useState<QuickMode>('today');

  function handleQuick(kind: 'today' | 'yesterday') {
    setMode(kind);
    if (kind === 'today') {
      setRange({ from: today, to: today });
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setRange({ from: y, to: y });
    }
  }

  function handleApplyRange(from: string, to: string) {
    setMode('range');
    setRange({ from, to });
  }

  const dateLabel =
    mode === 'today'
      ? `Today, ${formatDateShort(today)}`
      : mode === 'yesterday'
      ? `Yesterday, ${formatDateShort(range.from)}`
      : formatDateRange(range);

  const {
    data: summary,
    isPending: summaryPending,
    isError: summaryError,
    refetch: refetchSummary,
  } = useMyReportsSummary(range);

  const {
    data: members,
    isPending: membersPending,
    isError: membersError,
    refetch: refetchMembers,
  } = useMyReportsMemberStatuses(range);

  const isPending = summaryPending || membersPending;
  const isError = summaryError || membersError;

  if (isPending) {
    return <GlobalLoader fullScreen={false} />;
  }

  if (isError || !summary) {
    return (
      <div>
        <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 20px' }}>
          Team Overview
        </h1>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>
            Failed to load overview.
          </div>
          <button
            onClick={() => { refetchSummary(); refetchMembers(); }}
            style={{
              padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)',
              borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const sorted = [...(members ?? [])].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  );

  const avgPct =
    summary.avgUtilization === null
      ? '—'
      : `${Math.round(summary.avgUtilization)}%`;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 600 }}>
            My Reports — Team Overview
          </p>
          <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
            Team Overview
          </h1>
        </div>
        <DateRangeSelector
          mode={mode}
          range={range}
          todayISO={today}
          label={dateLabel}
          onSelectQuick={handleQuick}
          onApplyRange={handleApplyRange}
        />
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={<Users size={18} />}
          accent="var(--info)"
          label="Team Members"
          value={summary.activeMembers}
        />
        <KpiCard
          icon={<AlertCircle size={18} />}
          accent="var(--risk)"
          label="Missing EODs"
          value={summary.missingCount}
        />
        <KpiCard
          icon={<Clock size={18} />}
          accent="var(--warn)"
          label="Pending Approval"
          value={summary.pendingApprovalCount}
        />
        <KpiCard
          icon={<Plane size={18} />}
          accent="var(--info)"
          label="On Leave"
          value={summary.onLeaveCount}
        />
        <KpiCard
          icon={<Gauge size={18} />}
          accent={summary.avgUtilization !== null && summary.avgUtilization < 60 ? 'var(--warn)' : 'var(--ok)'}
          label="Avg Utilization"
          value={avgPct}
        />
      </div>

      {/* Member status table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Member Status</div>
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: TABLE_COLS, gap: 12,
          padding: '8px 20px', borderBottom: '1px solid var(--line)',
          fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Employee</span>
          <span>Code</span>
          <span style={{ textAlign: 'right' }}>Status</span>
          <span style={{ textAlign: 'right' }}>Util %</span>
          <span style={{ textAlign: 'right' }}>Blocker</span>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
            No team members to display.
          </div>
        ) : (
          sorted.map((m, i) => {
            const { color } = STATUS_CFG[m.status];
            const util =
              m.utilizationPct === null
                ? '—'
                : `${Math.round(m.utilizationPct)}%`;
            const utilColor =
              m.utilizationPct === null
                ? 'var(--txt-dim)'
                : m.utilizationPct < 60
                ? 'var(--warn)'
                : m.utilizationPct > 100
                ? 'var(--risk)'
                : 'var(--ok)';

            return (
              <div
                key={m.id}
                style={{
                  display: 'grid', gridTemplateColumns: TABLE_COLS, gap: 12,
                  alignItems: 'center', padding: '12px 20px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar name={m.fullName} color={color} />
                  <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.fullName}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {m.employeeCode}
                </span>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <StatusPill status={m.status} />
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', color: utilColor }}>
                  {util}
                </div>
                <div style={{ textAlign: 'right', fontSize: 13 }}>
                  {m.hasOpenBlocker ? (
                    <span title="Has open blocker" style={{ color: 'var(--risk)' }}>⚑</span>
                  ) : (
                    <span style={{ color: 'var(--txt-dim)' }}>—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
