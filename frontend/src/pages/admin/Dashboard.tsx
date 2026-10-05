import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users, UserCheck, UserX, Activity, ArrowRight, RefreshCw,
  Building2, Briefcase, MapPin, UserPlus,
} from 'lucide-react';
import { getAdminStats } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { describeAuditEvent, formatRelative, AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_LABELS } from '../../lib/auditLog';
import { GlobalLoader } from '../../components/GlobalLoader';
import { Card, KpiCard, ClickableKpi } from '../../components/KpiCard';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { Pagination } from '../../components/Pagination';

const RECENT_ACTIVITY_PAGE_SIZE = 9;

// ── Shared primitives ─────────────────────────────────────────────────────────

// ── Generic stat bar (role / department / location breakdowns) ─────────────────

function StatBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 90, fontSize: 11, color: 'var(--txt-mut)', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>
        {label}
      </div>
      <div style={{ flex: 1, height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ width: 28, fontSize: 11, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
        {count}
      </div>
    </div>
  );
}

function RoleBar({ roleKey, count, total }: { roleKey: string; count: number; total: number }) {
  const frontendRole = toRole(roleKey);
  return (
    <StatBar
      label={ROLE_LABELS[frontendRole] ?? roleKey}
      count={count}
      total={total}
      color={ROLE_COLORS[frontendRole] ?? 'var(--txt-dim)'}
    />
  );
}

// Neutral palette cycled by index — department/location names aren't tied to the fixed
// per-role colors in ROLE_COLORS, so this just needs enough visual separation between bars.
const BREAKDOWN_COLORS = ['var(--info)', 'var(--ok)', 'var(--warn)', 'var(--brand-bright)', 'var(--txt-mut)'];

function BreakdownCard({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 18 }}>{title}</div>
      {entries.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data</div>
        : entries.map(([label, count], i) => (
          <StatBar key={label} label={label} count={count} total={total} color={BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length]} />
        ))}
    </Card>
  );
}

// ── Compact name list (inactive users / new joiners) ────────────────────────────

function NameListCard({
  title, names, emptyLabel, viewAllTo, viewAllLabel,
}: {
  title: string; names: string[]; emptyLabel: string; viewAllTo?: string; viewAllLabel?: string;
}) {
  const VISIBLE = 8;
  const visible = names.slice(0, VISIBLE);
  const overflow = names.length - visible.length;
  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>{title}</div>
      {names.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>{emptyLabel}</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((name, i) => (
              <div key={`${name}-${i}`} style={{ fontSize: 12.5, color: 'var(--txt-mut)' }}>{name}</div>
            ))}
            {overflow > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>+{overflow} more</div>
            )}
          </div>
        )}
      {viewAllTo && (
        <Link
          to={viewAllTo}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
            marginTop: 'auto', paddingTop: 12, fontSize: 12, fontWeight: 500,
            color: 'var(--info)', textDecoration: 'none',
          }}
        >
          {viewAllLabel} <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}

// ── EOD submitted today ──────────────────────────────────────────────────────────

function EodTodayCard({ submitted, expected }: { submitted: number; expected: number }) {
  const pct = expected > 0 ? Math.round((submitted / expected) * 100) : 0;
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 18 }}>EOD Submitted Today</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>{submitted}</span>
        <span style={{ fontSize: 14, color: 'var(--txt-dim)' }}>/ {expected} active users</span>
      </div>
      <div style={{ height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ok)', borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
        {pct}% submitted so far today. Plain daily count, not the shift/holiday-aware compliance report.
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
  const [activityPage, setActivityPage] = useState(1);

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
  const roleEntries = Object.entries(stats.usersByRole ?? {}).filter(([, v]) => v > 0);
  const recentEvents = stats.recentAuditEvents ?? [];
  const activityTotalPages = Math.max(1, Math.ceil(recentEvents.length / RECENT_ACTIVITY_PAGE_SIZE));
  const activityPageSafe = Math.min(activityPage, activityTotalPages);
  const pagedEvents = recentEvents.slice(
    (activityPageSafe - 1) * RECENT_ACTIVITY_PAGE_SIZE, activityPageSafe * RECENT_ACTIVITY_PAGE_SIZE,
  );

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
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 18 }}>Users by Role</div>
          {roleEntries.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data</div>
            : roleEntries.map(([role, count]) => (
              <RoleBar key={role} roleKey={role} count={count} total={stats.totalUsers} />
            ))}
        </Card>

        {/* Recent audit events — admin/config-level only, see AdminStatsController.
            height:100% + flex column so the card fills whatever height the grid row
            stretched it to (matching the taller Users by Role card); the "View all" link's
            own marginTop:auto (below) is what absorbs that extra height, not this list —
            capped to RECENT_ACTIVITY_PAGE_SIZE rows + Pagination now, instead of an
            internal scroll region. */}
        <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>Recent Activity</div>
          {recentEvents.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No recent activity</div>
            : (
              <>
              <div>
                {pagedEvents.map((event) => {
                  const { message, category } = describeAuditEvent(event);
                  const Icon = AUDIT_CATEGORY_ICONS[category];
                  return (
                    <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
                      <div
                        title={AUDIT_CATEGORY_LABELS[category]}
                        aria-label={AUDIT_CATEGORY_LABELS[category]}
                        style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                          background: 'var(--raised2)', color: 'var(--txt-dim)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                        }}
                      >
                        <Icon size={13} aria-hidden="true" />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                        {message}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {formatRelative(event.occurredAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {activityTotalPages > 1 && (
                <Pagination
                  page={activityPageSafe} totalPages={activityTotalPages} totalItems={recentEvents.length}
                  pageSize={RECENT_ACTIVITY_PAGE_SIZE} onPageChange={setActivityPage} itemLabel="events"
                  style={{ padding: '12px 0 0', borderTop: 'none' }}
                />
              )}
              </>
            )}
          <Link
            to={`/admin/audit?from=${encodeURIComponent(since24h)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
              marginTop: 'auto', paddingTop: 12, fontSize: 12, fontWeight: 500,
              color: 'var(--info)', textDecoration: 'none',
            }}
          >
            View all {stats.auditEventsLast24h} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </Card>
      </div>

      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 24 }}>
        <BreakdownCard title="Users by Department" counts={stats.usersByDepartment ?? {}} />
        <BreakdownCard title="Users by Location" counts={stats.usersByLocation ?? {}} />
      </div>

      <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <EodTodayCard submitted={stats.eodSubmittedToday} expected={stats.eodExpectedToday} />
        <NameListCard
          title="Inactive Users"
          names={stats.inactiveUserNames ?? []}
          emptyLabel="No inactive users"
          viewAllTo="/admin/users?status=INACTIVE"
          viewAllLabel={`View all ${stats.inactiveUsers}`}
        />
        <NameListCard
          title="New Joiners (7 days)"
          names={stats.newUserNames ?? []}
          emptyLabel="No new joiners this week"
          viewAllTo="/admin/users?status=ALL"
          viewAllLabel="View all users"
        />
      </div>
    </div>
  );
}
