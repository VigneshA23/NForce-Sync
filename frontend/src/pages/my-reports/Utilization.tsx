import { useState } from 'react';
import { Gauge } from 'lucide-react';
import { DateRangeSelector } from '../../components/DateRangeSelector';
import { Card, KpiCard } from '../../components/KpiCard';
import { UtilBar } from '../../components/UtilBar';
import { GlobalLoader } from '../../components/GlobalLoader';
import {
  useMyReportsSummary,
  useMyReportsMemberStatuses,
} from '../../api/myReports';
import { todayISO, formatDateShort, formatDateRange } from '../../lib/date';
import type { MemberEodStatus } from '../../api/teamLead';

// ── helpers ───────────────────────────────────────────────────────────────────

// Monday of the current week as yyyy-MM-dd (local timezone)
function thisWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_CFG: Record<MemberEodStatus, { color: string; label: string }> = {
  SUBMITTED:        { color: 'var(--ok)',   label: 'Approved' },
  PENDING_APPROVAL: { color: 'var(--warn)', label: 'Pending' },
  MISSING:          { color: 'var(--risk)', label: 'Missing' },
  ON_LEAVE:         { color: 'var(--info)', label: 'On Leave' },
};

// ── primitives ────────────────────────────────────────────────────────────────

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

// ── main ──────────────────────────────────────────────────────────────────────

export default function MyReportsUtilization() {
  const today = todayISO();
  const weekStart = thisWeekStart();

  const [range, setRange] = useState({ from: weekStart, to: today });

  type QuickMode = 'today' | 'yesterday' | 'range';
  const [mode, setMode] = useState<QuickMode>('range');

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
          Team Utilization
        </h1>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>
            Failed to load utilization data.
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

  // Sort by utilization desc (nulls last), then name
  const sorted = [...(members ?? [])].sort((a, b) => {
    if (a.utilizationPct === null && b.utilizationPct === null) return a.fullName.localeCompare(b.fullName);
    if (a.utilizationPct === null) return 1;
    if (b.utilizationPct === null) return -1;
    return b.utilizationPct - a.utilizationPct;
  });

  const avgPct = summary.avgUtilization;
  const avgLabel = avgPct === null ? '—' : `${Math.round(avgPct)}%`;

  const underCount = summary.underutilizedCount;
  const overCount = summary.overloadedCount;
  const optimalCount = Math.max(summary.activeMembers - underCount - overCount, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 600 }}>
            My Reports — Team Utilization
          </p>
          <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
            Team Utilization
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={<Gauge size={18} />}
          accent={avgPct !== null && avgPct < 60 ? 'var(--warn)' : avgPct !== null && avgPct > 100 ? 'var(--risk)' : 'var(--ok)'}
          label="Avg Utilization"
          value={avgLabel}
        />
        <KpiCard
          icon={<Gauge size={18} />}
          accent="var(--ok)"
          label="Optimal (60–100%)"
          value={optimalCount}
          trend={{ label: `of ${summary.activeMembers} active`, positive: true }}
        />
        <KpiCard
          icon={<Gauge size={18} />}
          accent="var(--warn)"
          label="Under-utilised (<60%)"
          value={underCount}
          trend={{ label: underCount === 0 ? 'None' : `${Math.round((underCount / summary.activeMembers) * 100)}% of team`, positive: underCount === 0 }}
        />
        <KpiCard
          icon={<Gauge size={18} />}
          accent="var(--risk)"
          label="Overloaded (>100%)"
          value={overCount}
          trend={{ label: overCount === 0 ? 'None' : `${Math.round((overCount / summary.activeMembers) * 100)}% of team`, positive: overCount === 0 }}
        />
      </div>

      {/* Non-working day notice */}
      {!summary.workingDay && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', marginBottom: 16, borderRadius: 8,
          background: 'color-mix(in srgb, var(--warn) 10%, var(--panel))',
          border: '1px solid color-mix(in srgb, var(--warn) 25%, var(--line))',
          fontSize: 13, color: 'var(--warn)',
        }}>
          Non-working day — utilization data carries no real signal for this range.
        </div>
      )}

      {/* Per-member utilization bars */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>Member Utilization</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              { color: 'var(--ok)',   label: 'Healthy (60–100%)' },
              { color: 'var(--warn)', label: 'Under (<60%)' },
              { color: 'var(--risk)', label: 'Over (>100%)' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--txt-mut)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
            No utilization data for this period.
          </div>
        ) : (
          sorted.map((m, i) => {
            const { color: statusColor } = STATUS_CFG[m.status];

            return (
              <div
                key={m.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr 80px',
                  gap: 16, alignItems: 'center',
                  padding: '14px 20px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                {/* Employee name + avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar name={m.fullName} color={statusColor} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.fullName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                      {m.employeeCode}
                    </div>
                  </div>
                </div>

                {/* Util bar */}
                <UtilBar pct={m.utilizationPct} />

                {/* Raw % for alignment */}
                <div style={{
                  textAlign: 'right', fontSize: 12, fontWeight: 700,
                  fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
                  color: m.utilizationPct === null
                    ? 'var(--txt-dim)'
                    : m.utilizationPct < 60
                    ? 'var(--warn)'
                    : m.utilizationPct > 100
                    ? 'var(--risk)'
                    : 'var(--ok)',
                }}>
                  {m.utilizationPct === null ? '—' : `${Math.round(m.utilizationPct)}%`}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
