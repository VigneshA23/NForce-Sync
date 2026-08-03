import { useNavigate } from 'react-router-dom';
import { AlertCircle, Clock, CheckCircle2, TrendingUp, Zap, Activity, ArrowRight } from 'lucide-react';
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--txt-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// ── Calendar status helpers ────────────────────────────────────────────────────

function calendarCellColor(day: CalendarDay): string {
  if (day.isWeekend || day.isFuture || day.status === 'EMPTY') return 'var(--raised2)';
  switch (day.status) {
    case 'APPROVED':
      return utilColor(day.utilizationPct ?? null);
    case 'SUBMITTED':   return 'var(--info)';
    case 'DRAFT':       return 'var(--txt-dim)';
    case 'CHANGES_REQUESTED': return 'var(--warn)';
    case 'REJECTED':    return 'var(--risk)';
    case 'MISSED':      return 'var(--risk)';
    default:            return 'var(--raised2)';
  }
}

function calendarCellOpacity(day: CalendarDay): number {
  if (day.isWeekend || day.isFuture || day.status === 'EMPTY') return 1;
  if (day.status === 'DRAFT') return 0.5;
  return 1;
}

function calendarTooltip(day: CalendarDay): string {
  const d = new Date(day.date + 'T12:00:00');
  const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (day.isWeekend) return `${label} — Weekend`;
  if (day.isFuture)  return `${label} — Future`;
  if (day.status === 'EMPTY') return `${label} — No entry`;
  if (day.status === 'APPROVED') {
    const pct = fmtPct(day.utilizationPct ?? null);
    return `${label} — Approved · ${pct}`;
  }
  const statusLabel: Record<string, string> = {
    SUBMITTED: 'Submitted (pending)',
    DRAFT: 'Draft (not submitted)',
    MISSED: 'Missed',
    REJECTED: 'Rejected',
    CHANGES_REQUESTED: 'Changes requested',
  };
  return `${label} — ${statusLabel[day.status] ?? day.status}`;
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
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

// ── Calendar heatmap ───────────────────────────────────────────────────────────

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function CalendarHeatmap({ days }: { days: CalendarDay[] }) {
  return (
    <div>
      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_HEADERS.map(d => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 9, color: 'var(--txt-dim)',
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* 35-cell grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {days.map((day) => {
          const color   = calendarCellColor(day);
          const opacity = calendarCellOpacity(day);
          const dayNum = new Date(day.date + 'T12:00:00').getDate();

          return (
            <div
              key={day.date}
              title={calendarTooltip(day)}
              style={{
                aspectRatio: '1',
                borderRadius: 4,
                background: color,
                opacity,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                color: day.isWeekend || day.isFuture || day.status === 'EMPTY'
                  ? 'var(--txt-dim)'
                  : 'rgba(0,0,0,0.6)',
                fontWeight: 600,
                cursor: 'default',
                transition: 'opacity 0.15s',
                outline: day.status === 'SUBMITTED' ? '1px solid var(--info)' : undefined,
              }}
            >
              {dayNum}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: 'var(--txt-mut)',
      }}>
        {[
          { color: 'var(--ok)',      label: 'Healthy' },
          { color: 'var(--warn)',    label: 'Under / CR' },
          { color: 'var(--risk)',    label: 'Over / Missed' },
          { color: 'var(--info)',    label: 'Pending' },
          { color: 'var(--txt-dim)', label: 'Draft' },
          { color: 'var(--raised2)', label: 'No data' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
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
          fontSize: 12, fontWeight: 600, textDecoration: 'none',
          flexShrink: 0,
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
        <div style={{
          textAlign: 'center', padding: '20px 0',
          fontSize: 13, color: 'var(--txt-dim)',
        }}>
          <CheckCircle2 size={28} style={{ color: 'var(--ok)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
          No active blockers
        </div>
      </Card>
    );
  }

  return (
    <Card pad={0}>
      <div style={{ padding: '14px 16px 10px' }}>
        <SectionLabel>My Blockers</SectionLabel>
      </div>
      {tasks.map((t, i) => {
        const d = new Date(t.entryDate + 'T12:00:00');
        const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return (
          <div key={`${t.entryId}-${i}`} style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--line)',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: 3,
              background: 'var(--risk)', marginTop: 6, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.4, marginBottom: 4 }}>
                {t.description}
              </div>
              {t.blockerReason && (
                <div style={{ fontSize: 11, color: 'var(--txt-mut)', fontStyle: 'italic', lineHeight: 1.4, marginBottom: 4 }}>
                  {t.blockerReason}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--txt-dim)' }}>
                <span style={{
                  padding: '1px 6px', borderRadius: 3,
                  background: 'var(--raised2)', color: 'var(--txt-mut)',
                }}>
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

      {entries.length === 0 ? (
        <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--txt-dim)', textAlign: 'center' }}>
          No recent entries
        </div>
      ) : (
        entries.map((entry) => {
          const d = new Date(entry.date + 'T12:00:00');
          const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const utilAccent = utilColor(entry.utilizationPct ?? null);
          return (
            <div key={entry.id} style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--line)',
              display: 'grid',
              gridTemplateColumns: '140px 1fr auto auto',
              gap: 12, alignItems: 'center',
            }}>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>
                {dateLabel}
              </div>
              <StatusBadge status={entry.status} />
              {entry.status === 'APPROVED' && (
                <span style={{
                  fontSize: 11, color: utilAccent,
                  fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtPct(entry.utilizationPct ?? null)}
                </span>
              )}
              {entry.status !== 'APPROVED' && <span />}
              <span style={{
                fontSize: 11, color: 'var(--txt-dim)',
                fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums',
              }}>
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
        {[0,1,2,3].map(i => (
          <div key={i} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
            <Skel h={36} w={36} /><div style={{ marginTop: 12 }} />
            <Skel h={28} w="55%" /><div style={{ marginTop: 8 }} />
            <Skel h={12} w="45%" />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={120} />
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: 35 }).map((_, i) => <Skel key={i} h={28} />)}
          </div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }}>
          <Skel h={14} w={100} />
          <div style={{ marginTop: 12 }}>
            {[0,1,2].map(i => <div key={i} style={{ marginBottom: 12 }}><Skel h={48} /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboardSummary();

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

  const today = new Date(cutoffStatus.today + 'T12:00:00');
  const todayLabel = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;

  // streak label
  const streakLabel = quickStats.streak === 0
    ? 'No streak'
    : `${quickStats.streak} day${quickStats.streak === 1 ? '' : 's'}`;

  // days since last issue
  const dsiLabel = quickStats.daysSinceLastIssue < 0
    ? 'No issues'
    : quickStats.daysSinceLastIssue === 0
    ? 'Today'
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
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          {todayLabel}
        </p>
      </div>

      {/* Cutoff banner — only if not weekend */}
      {!isWeekend && (
        <CutoffBanner
          status={cutoffStatus.entryStatus}
          cutoffPassed={cutoffStatus.cutoffPassed}
          cutoffTime={cutoffStatus.cutoffTime}
        />
      )}

      {/* Quick stats */}
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
          accent={quickStats.daysSinceLastIssue < 0 || quickStats.daysSinceLastIssue > 7
            ? 'var(--ok)'
            : quickStats.daysSinceLastIssue <= 2
            ? 'var(--risk)'
            : 'var(--warn)'}
        />
      </div>

      {/* Calendar + Blockers row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
        {/* Calendar heatmap */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionLabel>5-Week Activity</SectionLabel>
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
          <CalendarHeatmap days={calendarData} />
        </Card>

        {/* Blockers */}
        <BlockersPanel tasks={blockedTasks} />
      </div>

      {/* Recent entries */}
      <RecentActivity entries={recentEntries} />
    </div>
  );
}
