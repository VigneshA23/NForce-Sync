import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  Clock, CheckCircle2, AlertTriangle, RefreshCw,
  ChevronRight, MessageSquare, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { todayISO, toLocalISODate } from '../../lib/date';
import { fmtPct, utilColor, workingWeek } from '../../lib/rules';
import { listEntries } from '../../api/eod';
import { useEmployeeUtil } from '../../api/utilization';
import { useEmployeeDashboardStats, useMyProjects, useUpcomingHolidays } from '../../api/employee';

// ── status config (mirrors lead/TeamDashboard.tsx) ──────────────────────────────

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  SUBMITTED:          { color: 'var(--info)', label: 'Submitted' },
  APPROVED:           { color: 'var(--ok)',   label: 'Approved' },
  REJECTED:           { color: 'var(--risk)', label: 'Rejected' },
  CHANGES_REQUESTED:  { color: 'var(--warn)', label: 'Changes Req.' },
  DRAFT:              { color: 'var(--txt-dim)', label: 'Draft' },
  MISSING:            { color: 'var(--txt-dim)', label: 'Missing' },
};

function StatusBadge({ status }: { status: string }) {
  const { color, label } = STATUS_CFG[status] ?? { color: 'var(--txt-dim)', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      fontFamily: '"Inter", sans-serif',
    }}>
      {label}
    </span>
  );
}

// ── primitives ─────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 10, padding: 20, ...style,
    }}>
      {children}
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{subtitle}</div>}
      </div>
      {children}
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
      {children}
    </div>
  );
}

function KpiCard({
  icon, label, value, accent = 'var(--txt)', action, onAction,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div
      onClick={onAction}
      role={onAction ? 'button' : undefined}
      tabIndex={onAction ? 0 : undefined}
      onKeyDown={onAction ? (e) => { if (e.key === 'Enter') onAction(); } : undefined}
      onMouseEnter={onAction ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line2)'; } : undefined}
      onMouseLeave={onAction ? (e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; } : undefined}
      style={{
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20,
        cursor: onAction ? 'pointer' : 'default',
        transition: 'border-color 0.14s',
        outline: 'none',
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--raised2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, marginBottom: 14 }}>
        {icon}
      </div>
      <div style={{
        fontFamily: '"Space Grotesk", sans-serif', fontSize: 32, fontWeight: 700,
        color: accent, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        marginBottom: 6,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt-mut)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {action && <div style={{ fontSize: 11, color: 'var(--info)', marginTop: 8 }}>{action} →</div>}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ── utilization mini-chart ───────────────────────────────────────────────────────

function UtilChart({ data }: { data: { label: string; pct: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#2A2E37" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={{ stroke: '#2A2E37' }} tickLine={false} />
        <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          contentStyle={{ background: '#1E2128', border: '1px solid #353A45', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#E8EAED' }}
          formatter={(value) => [value == null ? 'N/A' : `${value}%`, 'Utilization']}
        />
        <Line type="monotone" dataKey="pct" stroke="#4C8DD6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = todayISO();

  const { data: stats, isPending: statsPending, isError: statsError, refetch: refetchStats } =
    useEmployeeDashboardStats(user?.id);

  const { data: entries = [], isPending: entriesPending, isError: entriesError } = useQuery({
    queryKey: ['eod-history'],
    queryFn: () => listEntries(),
  });

  const { data: projects, isPending: projectsPending, isError: projectsError } = useMyProjects(user?.id);
  const { data: holidays, isPending: holidaysPending, isError: holidaysError } = useUpcomingHolidays();

  const week = useMemo(() => workingWeek(new Date()), []);
  const weekFrom = toLocalISODate(week[0].date);
  const weekTo   = toLocalISODate(week[week.length - 1].date);
  const monthFrom = today.slice(0, 8) + '01';

  const { data: weekSnaps } = useEmployeeUtil(user!.id, weekFrom, weekTo);
  const { data: monthSnaps } = useEmployeeUtil(user!.id, monthFrom, today);

  const weekChartData = useMemo(() => {
    const bySnapDate = new Map((weekSnaps ?? []).map(s => [s.snapshotDate, s.utilizationPct]));
    return week.map(d => ({
      label: d.label,
      pct: bySnapDate.get(toLocalISODate(d.date)) ?? null,
    }));
  }, [week, weekSnaps]);

  const monthChartData = useMemo(() => {
    return (monthSnaps ?? [])
      .filter(s => {
        const dow = new Date(s.snapshotDate + 'T00:00:00').getDay();
        return dow !== 0 && dow !== 6;
      })
      .map(s => ({
        label: new Date(s.snapshotDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        pct: s.utilizationPct,
      }));
  }, [monthSnaps]);

  const monthAvg = useMemo(() => {
    const withPct = (monthSnaps ?? []).filter(s => s.utilizationPct !== null);
    if (withPct.length === 0) return null;
    return withPct.reduce((sum, s) => sum + (s.utilizationPct ?? 0), 0) / withPct.length;
  }, [monthSnaps]);

  const recentEntries = entries.slice(0, 5);

  if (statsPending || entriesPending) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <Skel h={26} w={200} />
          <div style={{ marginTop: 8 }}><Skel h={14} w={160} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[0, 1, 2, 3].map(i => (
            <Card key={i}><Skel h={32} w={60} /><div style={{ marginTop: 8 }}><Skel h={12} w={80} /></div></Card>
          ))}
        </div>
        <Card><Skel h={200} /></Card>
      </div>
    );
  }

  if (statsError || entriesError) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>My Dashboard</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load dashboard.</div>
          <button
            onClick={() => refetchStats()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  const todayStatus = stats!.todayStatus.status;
  const correctionsCount = stats!.pendingCorrections.length;
  const missedCount = stats!.missedCount;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            My Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            {user?.name} · {today}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard
          icon={<Clock size={16} />}
          label="Today's EOD Status"
          value={<StatusBadge status={todayStatus} />}
          action={(todayStatus === 'MISSING' || todayStatus === 'DRAFT') ? 'Submit now' : undefined}
          onAction={(todayStatus === 'MISSING' || todayStatus === 'DRAFT') ? () => navigate('/eod/submit') : undefined}
        />
        <KpiCard
          icon={<MessageSquare size={16} />}
          label="Pending Corrections"
          value={correctionsCount}
          accent={correctionsCount > 0 ? 'var(--warn)' : 'var(--txt)'}
          action={correctionsCount > 0 ? 'Fix now' : undefined}
          onAction={correctionsCount > 0 ? () => navigate(`/eod/submit?date=${stats!.pendingCorrections[0].entryDate}`) : undefined}
        />
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="Missed This Month"
          value={missedCount}
          accent={missedCount > 0 ? 'var(--risk)' : 'var(--txt)'}
        />
        <KpiCard
          icon={<CheckCircle2 size={16} />}
          label="Monthly Utilization"
          value={fmtPct(monthAvg)}
          accent={utilColor(monthAvg)}
        />
      </div>

      {/* Row 2: Submission history + Pending corrections */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SectionCard title="Submission History" subtitle="Most recent">
          {recentEntries.length === 0 ? (
            <EmptyRow>No EOD reports yet.</EmptyRow>
          ) : (
            <>
              {recentEntries.map((e, i) => (
                <div
                  key={e.id}
                  onClick={() => navigate(`/eod/submit?date=${e.entryDate}`)}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '12px 16px', cursor: 'pointer',
                    borderBottom: i === recentEntries.length - 1 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <div style={{ fontSize: 13, color: 'var(--txt)' }}>{formatDate(e.entryDate)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusBadge status={e.status} />
                    <ChevronRight size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden="true" />
                  </div>
                </div>
              ))}
              <div
                onClick={() => navigate('/eod/history')}
                role="button"
                tabIndex={0}
                style={{ padding: '10px 16px', fontSize: 12, color: 'var(--info)', cursor: 'pointer', borderTop: '1px solid var(--line)' }}
              >
                View all history →
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard title="Pending Corrections" subtitle={`${correctionsCount} item${correctionsCount !== 1 ? 's' : ''}`}>
          {correctionsCount === 0 ? (
            <EmptyRow>Nothing needs correction — nice work.</EmptyRow>
          ) : (
            stats!.pendingCorrections.map((c, i) => (
              <div
                key={c.entryId}
                onClick={() => navigate(`/eod/submit?date=${c.entryDate}`)}
                role="button"
                tabIndex={0}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: i === stats!.pendingCorrections.length - 1 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: c.reviewerComment ? 4 : 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--txt)' }}>{formatDate(c.entryDate)}</div>
                  <StatusBadge status={c.status} />
                </div>
                {c.reviewerComment && (
                  <div style={{ fontSize: 12, color: 'var(--warn)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{c.reviewerComment}"
                  </div>
                )}
              </div>
            ))
          )}
        </SectionCard>
      </div>

      {/* Row 3: Weekly + Monthly utilization charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <SectionCard title="Weekly Utilization" subtitle="Mon–Fri">
          <div style={{ padding: '12px 8px 4px' }}>
            <UtilChart data={weekChartData} />
          </div>
        </SectionCard>
        <SectionCard title="Monthly Utilization" subtitle="Working days, month to date">
          <div style={{ padding: '12px 8px 4px' }}>
            {monthChartData.length === 0 ? (
              <EmptyRow>No approved hours yet this month.</EmptyRow>
            ) : (
              <UtilChart data={monthChartData} />
            )}
          </div>
        </SectionCard>
      </div>

      {/* Row 4: Assigned projects */}
      <div style={{ marginBottom: 16 }}>
        <SectionCard title="Assigned Projects" subtitle={projects ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : undefined}>
          {projectsPending ? (
            <div style={{ padding: 16 }}><Skel h={80} /></div>
          ) : projectsError ? (
            <EmptyRow>Failed to load assigned projects.</EmptyRow>
          ) : projects!.length === 0 ? (
            <EmptyRow>No projects assigned yet.</EmptyRow>
          ) : (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1fr 100px',
                padding: '8px 16px', borderBottom: '1px solid var(--line)', gap: 12,
              }}>
                {['Project', 'Manager', 'Assigned', 'Through', 'Status'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
                ))}
              </div>
              {projects!.map((p, i) => (
                <div
                  key={p.projectId}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1fr 100px',
                    padding: '12px 16px', gap: 12, alignItems: 'center',
                    borderBottom: i === projects!.length - 1 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{p.projectName}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>{p.projectCode}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>{p.pmName ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>{p.assignedFrom}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace' }}>{p.assignedTo ?? 'Ongoing'}</div>
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      color: p.projectStatus === 'ACTIVE' ? 'var(--ok)' : 'var(--txt-dim)',
                      background: p.projectStatus === 'ACTIVE' ? 'color-mix(in srgb, var(--ok) 14%, transparent)' : 'var(--raised2)',
                    }}>
                      {p.projectStatus}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </SectionCard>
      </div>

      {/* Row 5: Missed submissions + Leave/Holiday visibility */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="Missed Submissions" subtitle={`${missedCount} this month`}>
          {missedCount === 0 ? (
            <EmptyRow>No missed submissions this month.</EmptyRow>
          ) : (
            stats!.missedDates.map((d, i) => (
              <div
                key={d}
                onClick={() => navigate(`/eod/submit?date=${d}`)}
                role="button"
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: i === stats!.missedDates.length - 1 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--txt)' }}>{formatDate(d)}</div>
                <StatusBadge status="MISSING" />
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard title="Upcoming Holidays">
          {holidaysPending ? (
            <div style={{ padding: 16 }}><Skel h={60} /></div>
          ) : holidaysError ? (
            <EmptyRow>Failed to load holiday calendar.</EmptyRow>
          ) : holidays!.length === 0 ? (
            <EmptyRow>No upcoming holidays.</EmptyRow>
          ) : (
            holidays!.map((h, i) => (
              <div
                key={h.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderBottom: i === holidays!.length - 1 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                  background: 'var(--raised2)', color: 'var(--info)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CalendarDays size={15} aria-hidden="true" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{h.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{formatDate(h.holidayDate)}</div>
                </div>
              </div>
            ))
          )}
        </SectionCard>
      </div>
    </div>
  );
}
