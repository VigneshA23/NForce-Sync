import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import {
  Users, UserCheck, UserX, Activity, RefreshCw,
  Building2, Briefcase, MapPin, UserPlus,
} from 'lucide-react';
import { getAdminStats } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { GlobalLoader } from '../../components/GlobalLoader';
import { Card, KpiCard, ClickableKpi } from '../../components/KpiCard';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { DonutBreakdown, type DonutSegment } from '../../components/DonutBreakdown';

// ── Shared primitives ─────────────────────────────────────────────────────────

// ── Donut breakdown cards (role / department / location) ───────────────────────

// Department/location names aren't tied to the fixed per-role colors in ROLE_COLORS, so they cycle
// the app's chart tokens (index.css --cat-1..5, tuned for light + dark) and then the status hues.
const BREAKDOWN_COLORS = [
  'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)',
  'var(--ok)', 'var(--warn)', 'var(--info)', 'var(--brand-bright)',
];

type BreakdownView = 'role' | 'department' | 'location';
const BREAKDOWN_VIEWS: { key: BreakdownView; label: string }[] = [
  { key: 'role',       label: 'Role' },
  { key: 'department', label: 'Department' },
  { key: 'location',   label: 'Location' },
];

// One donut card, switchable between the three user breakdowns.
function UsersBreakdownCard({ byRole, byDepartment, byLocation }: {
  byRole: Record<string, number>;
  byDepartment: Record<string, number>;
  byLocation: Record<string, number>;
}) {
  const [view, setView] = useState<BreakdownView>('role');
  const segments = view === 'role' ? roleSegments(byRole)
    : view === 'department' ? toSegments(byDepartment)
    : toSegments(byLocation);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Users by {BREAKDOWN_VIEWS.find(v => v.key === view)?.label}</div>
        <div role="tablist" aria-label="Group users by" style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--raised2)', borderRadius: 8 }}>
          {BREAKDOWN_VIEWS.map(({ key, label }) => {
            const selected = view === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setView(key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: selected ? 600 : 500,
                  background: selected ? 'var(--brand)' : 'transparent',
                  color: selected ? '#fff' : 'var(--txt-mut)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {segments.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data</div>
        : <DonutBreakdown data={segments} />}
    </Card>
  );
}

function toSegments(counts: Record<string, number>): DonutSegment[] {
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }));
}

function roleSegments(counts: Record<string, number>): DonutSegment[] {
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => {
      const role = toRole(key);
      return { label: ROLE_LABELS[role] ?? key, value, color: ROLE_COLORS[role] ?? 'var(--txt-dim)' };
    });
}

// ── EOD submitted today ──────────────────────────────────────────────────────────

function EodTodayCard({ submitted, expected }: { submitted: number; expected: number }) {
  const pct = expected > 0 ? Math.round((submitted / expected) * 100) : 0;
  const pending = Math.max(0, expected - submitted);
  const ringData = [
    { name: 'Submitted', value: submitted },
    { name: 'Pending',   value: pending },
  ];
  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>EOD Submitted Today</div>
        <span style={{
          padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: 'var(--info)',
          background: 'color-mix(in srgb, var(--info) 14%, transparent)',
          border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)',
        }}>
          {pct}% done
        </span>
      </div>

      {/* flex:1 + centering: the card stretches to the height of the Users card beside it, so the ring and
          tiles sit in the middle of the space instead of leaving a blank strip underneath. */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 170, height: 170, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={ringData} dataKey="value" cx="50%" cy="50%"
                innerRadius="68%" outerRadius="100%" startAngle={90} endAngle={-270}
                stroke="none" isAnimationActive={false}
              >
                <Cell fill="var(--cat-1)" />
                <Cell fill="var(--raised2)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>{submitted}</span>
            <span style={{ fontSize: 12, color: 'var(--txt-dim)', marginTop: 4 }}>of {expected}</span>
          </div>
        </div>

        <div style={{ flex: '1 1 180px', maxWidth: 280, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Submitted', value: submitted, color: 'var(--cat-1)' },
            { label: 'Pending',   value: pending,   color: 'var(--cat-3)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '14px 16px', borderRadius: 10, background: 'var(--raised2)', borderLeft: `3px solid ${color}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)' }}>{label}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', marginTop: 14, flexShrink: 0 }}>
        Plain daily count of active users, not the shift/holiday-aware compliance report.
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  // Computed once per mount, not on every render (Date.now() is impure) — used to
  // deep-link "View all N →" to the same 24h window the KPI count reflects.
  const [since24h] = useState(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  // Admin stats rarely change mid-session; override global 30s with 5-minute cache
  // to avoid a Neon round-trip (~600-800ms) on every navigation back to this page.
  const { data: stats, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStats,
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div>
        <HeroBanner subtitle="Platform health at a glance." />
        <GlobalLoader fullScreen={false} />
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <HeroBanner subtitle="Platform health at a glance." />
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load dashboard stats.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  // Both defaulted: a partial stats payload should degrade to an empty section, not blank
  // the page.

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <HeroBanner subtitle="Platform health at a glance." />
      </div>

      {/* KPI row — its own full-width row below the hero/quick-actions row. Four columns at
          desktop widths (matching the banner's width above); .nf-r-kpis' own media queries
          already collapse this to 2-up then 1-up below 1024px/380px. */}
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        <ClickableKpi onClick={() => navigate('/admin/users?status=ALL')}>
          <KpiCard icon={<Users size={18} />} label="Total Users" value={stats.totalUsers} accent="var(--txt)" />
        </ClickableKpi>
        <ClickableKpi onClick={() => navigate('/admin/users?status=ACTIVE')}>
          <KpiCard icon={<UserCheck size={18} />} label="Active Users" value={stats.activeUsers} accent="var(--ok)" />
        </ClickableKpi>
        <ClickableKpi onClick={() => navigate('/admin/users?status=INACTIVE')}>
          <KpiCard icon={<UserX size={18} />} label="Inactive Users" value={stats.inactiveUsers} accent="var(--txt-dim)" />
        </ClickableKpi>
        <ClickableKpi onClick={() => navigate(`/admin/audit?from=${encodeURIComponent(since24h)}`)}>
          <KpiCard icon={<Activity size={18} />} label="Audit Events (24h)" value={stats.auditEventsLast24h} accent="var(--info)" />
        </ClickableKpi>
      </div>

      {/* Org Masters snapshot + new joiners — second KPI row, same grid/breakpoints as above.
          Departments/Designations/Locations deep-link to Org Masters since that's where Admin
          manages those records; New Joiners has no dedicated filtered view to link to, so it's
          a plain (non-clickable) tile. */}
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        <ClickableKpi onClick={() => navigate('/admin/org-masters')}>
          <KpiCard icon={<Building2 size={18} />} label="Departments" value={stats.departmentCount} accent="var(--info)" />
        </ClickableKpi>
        <ClickableKpi onClick={() => navigate('/admin/org-masters')}>
          <KpiCard icon={<Briefcase size={18} />} label="Designations" value={stats.designationCount} accent="var(--warn)" />
        </ClickableKpi>
        <ClickableKpi onClick={() => navigate('/admin/org-masters')}>
          <KpiCard icon={<MapPin size={18} />} label="Locations" value={stats.locationCount} accent="var(--brand-bright)" />
        </ClickableKpi>
        <KpiCard icon={<UserPlus size={18} />} label="New Joiners (7 days)" value={stats.newUsersLast7Days} accent="var(--ok)" />
      </div>

      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 24 }}>
        {/* Users by role */}
        <UsersBreakdownCard
          byRole={stats.usersByRole ?? {}}
          byDepartment={stats.usersByDepartment ?? {}}
          byLocation={stats.usersByLocation ?? {}}
        />

        <EodTodayCard submitted={stats.eodSubmittedToday} expected={stats.eodExpectedToday} />
      </div>
    </div>
  );
}
