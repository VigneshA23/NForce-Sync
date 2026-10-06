import { useState } from 'react';
import { DateRangeSelector } from '../../components/DateRangeSelector';
import { Card } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import { useMyReportsMemberStatuses } from '../../api/myReports';
import { todayISO, formatDateShort, formatDateRange } from '../../lib/date';
import type { MemberEodStatus } from '../../api/teamLead';

// ── status config ─────────────────────────────────────────────────────────────

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

// ── table column template ─────────────────────────────────────────────────────

const TABLE_COLS = '2fr 1.2fr 110px 80px 60px';

// ── main ──────────────────────────────────────────────────────────────────────

export default function MyReportsEodStatus() {
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
    data: members,
    isPending,
    isError,
    refetch,
  } = useMyReportsMemberStatuses(range);

  if (isPending) {
    return <GlobalLoader fullScreen={false} />;
  }

  if (isError) {
    return (
      <div>
        <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 20px' }}>
          Team EOD Status
        </h1>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>
            Failed to load EOD status.
          </div>
          <button
            onClick={() => refetch()}
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

  // Count per status for the quick summary chips
  const counts = sorted.reduce(
    (acc, m) => { acc[m.status] = (acc[m.status] ?? 0) + 1; return acc; },
    {} as Partial<Record<MemberEodStatus, number>>,
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 600 }}>
            My Reports — Team EOD Status
          </p>
          <h1 style={{ fontFamily: 'Inter, "Segoe UI", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
            Team EOD Status
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

      {/* Status summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {(Object.entries(STATUS_CFG) as [MemberEodStatus, { color: string; label: string }][]).map(([key, cfg]) => {
          const count = counts[key] ?? 0;
          return (
            <div key={key} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 8,
              background: `color-mix(in srgb, ${cfg.color} 10%, var(--panel))`,
              border: `1px solid color-mix(in srgb, ${cfg.color} 25%, var(--line))`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: TABLE_COLS, gap: 12,
          padding: '8px 20px', borderBottom: '1px solid var(--line)',
          fontSize: 10, color: 'var(--txt-dim)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Name</span>
          <span>Employee Code</span>
          <span style={{ textAlign: 'right' }}>Status</span>
          <span style={{ textAlign: 'right' }}>Utilization</span>
          <span style={{ textAlign: 'right' }}>Blocker</span>
        </div>

        {sorted.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>
              No members found
            </div>
            <div style={{ fontSize: 13, color: 'var(--txt-dim)' }}>
              No team member EOD data for the selected date range.
            </div>
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
                {/* Name + avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar name={m.fullName} color={color} />
                  <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.fullName}
                  </span>
                </div>

                {/* Employee code */}
                <span style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {m.employeeCode}
                </span>

                {/* Status pill */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <StatusPill status={m.status} />
                </div>

                {/* Utilization */}
                <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums', color: utilColor }}>
                  {util}
                </div>

                {/* Blocker indicator */}
                <div style={{ textAlign: 'right', fontSize: 13 }}>
                  {m.hasOpenBlocker ? (
                    <span
                      title="Has open blocker"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 11, fontWeight: 600, color: 'var(--risk)',
                        padding: '2px 8px', borderRadius: 4,
                        background: 'color-mix(in srgb, var(--risk) 12%, transparent)',
                      }}
                    >
                      Yes
                    </span>
                  ) : (
                    <span style={{ color: 'var(--txt-dim)', fontSize: 12 }}>—</span>
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
