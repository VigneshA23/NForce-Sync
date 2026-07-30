import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Users, UserCheck, UserX, Activity, ArrowRight, RefreshCw } from 'lucide-react';
import { getAdminStats } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { describeAuditEvent, formatRelative, AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_LABELS } from '../../lib/auditLog';

// ── Shared primitives ─────────────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: 'var(--txt)',
        margin: '0 0 4px',
        letterSpacing: '-0.01em',
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      padding: '20px',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
}

function KpiCard({ icon, label, value, accent = 'var(--txt)' }: KpiProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'var(--raised2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accent,
        }}>
          {icon}
        </div>
      </div>
      <div style={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: accent,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        marginBottom: 6,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontWeight: 500 }}>{label}</div>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return (
    <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />
  );
}

// ── Inactive users tile — hover popover ────────────────────────────────────────

// `names` is defaulted, not required: an older backend build omits inactiveUserNames from
// /api/admin/stats entirely, and an undefined .map() here took down the whole app.
function InactiveUsersTile({ count, names = [] }: { count: number; names?: string[] }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
    >
      <KpiCard icon={<UserX size={18} />} label="Inactive Users" value={count} accent="var(--txt-dim)" />
      {hover && (
        <div
          role="tooltip"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
            minWidth: 200, maxWidth: 280,
            background: 'var(--raised)', border: '1px solid var(--line2)',
            borderRadius: 8, padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.6,
          }}
        >
          {count === 0 ? (
            <span>No inactive users</span>
          ) : (
            <>
              <div style={{ fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>
                {count} Inactive:
              </div>
              {names.map((name) => <div key={name}>{name}</div>)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Role bar ──────────────────────────────────────────────────────────────────

function RoleBar({ roleKey, count, total }: { roleKey: string; count: number; total: number }) {
  const frontendRole = toRole(roleKey);
  const label = ROLE_LABELS[frontendRole] ?? roleKey;
  const color = ROLE_COLORS[frontendRole] ?? 'var(--txt-dim)';
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 90, fontSize: 11, color: 'var(--txt-mut)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: 'var(--raised2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ width: 28, fontSize: 11, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums', fontFamily: '"JetBrains Mono", monospace', textAlign: 'right', flexShrink: 0 }}>
        {count}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  // Computed once per mount, not on every render (Date.now() is impure) — used to
  // deep-link "View all N →" to the same 24h window the KPI count reflects.
  const [since24h] = useState(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  const { data: stats, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStats,
  });

  if (isPending) {
    return (
      <div>
        <PageHeader title="Admin Dashboard" subtitle="Platform health at a glance." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[0,1,2,3].map(i => (
            <Card key={i}>
              <Skel h={36} w={36} /><br />
              <Skel h={28} w="60%" /><br />
              <Skel h={12} w="40%" />
            </Card>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card><Skel h={200} /></Card>
          <Card><Skel h={200} /></Card>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Admin Dashboard" subtitle="Platform health at a glance." />
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

  // Both defaulted for the same reason as InactiveUsersTile: a partial stats payload should
  // degrade to an empty section, not blank the page.
  const roleEntries = Object.entries(stats.usersByRole ?? {}).filter(([, v]) => v > 0);
  const recentEvents = stats.recentAuditEvents ?? [];

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Platform health at a glance." />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard icon={<Users size={18} />} label="Total Users"         value={stats.totalUsers}         accent="var(--txt)" />
        <KpiCard icon={<UserCheck size={18} />} label="Active Users"     value={stats.activeUsers}        accent="#2FB67C" />
        <InactiveUsersTile count={stats.inactiveUsers} names={stats.inactiveUserNames} />
        <KpiCard icon={<Activity size={18} />} label="Audit Events (24h)" value={stats.auditEventsLast24h} accent="#4C8DD6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, marginBottom: 24 }}>
        {/* Users by role */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 18 }}>Users by Role</div>
          {roleEntries.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data</div>
            : roleEntries.map(([role, count]) => (
              <RoleBar key={role} roleKey={role} count={count} total={stats.totalUsers} />
            ))}
        </Card>

        {/* Recent audit events — admin/config-level only, see AdminStatsController */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>Recent Activity</div>
          {recentEvents.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No recent activity</div>
            : recentEvents.map((event) => {
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
                  <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {formatRelative(event.occurredAt)}
                  </div>
                </div>
              );
            })}
          <Link
            to={`/admin/audit?from=${encodeURIComponent(since24h)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 4, fontSize: 12, fontWeight: 500,
              color: '#4C8DD6', textDecoration: 'none',
            }}
          >
            View all {stats.auditEventsLast24h} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 14 }}>Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'User Management', path: '/admin/users' },
            { label: 'Audit Log',       path: '/admin/audit' },
            { label: 'Roles & Access',  path: '/admin/roles' },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                background: 'var(--raised2)',
                border: '1px solid var(--line2)',
                borderRadius: 7,
                color: 'var(--txt)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'border-color 0.14s, background 0.14s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--txt-dim)'; e.currentTarget.style.background = 'var(--raised)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line2)'; e.currentTarget.style.background = 'var(--raised2)'; }}
            >
              {label}
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
