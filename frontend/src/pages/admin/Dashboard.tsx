import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, UserX, Activity, ArrowRight, RefreshCw } from 'lucide-react';
import { getAdminStats } from '../../api/admin';
import type { AuditLogDto } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';

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

// ── Audit action label ─────────────────────────────────────────────────────────

function humanAction(event: AuditLogDto): string {
  const actor = event.actorName ?? 'System';
  const entity = event.entityType?.toLowerCase() ?? 'record';
  switch (event.action) {
    case 'CREATE':       return `${actor} created a new ${entity}`;
    case 'UPDATE':       return `${actor} updated a ${entity}`;
    case 'STATUS_CHANGE':return `${actor} changed ${entity} status`;
    case 'PASSWORD_RESET': return `${actor} reset a password`;
    default:             return `${actor} performed ${event.action} on ${entity}`;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
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

  const roleEntries = Object.entries(stats.usersByRole).filter(([, v]) => v > 0);

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Platform health at a glance." />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard icon={<Users size={18} />} label="Total Users"         value={stats.totalUsers}         accent="var(--txt)" />
        <KpiCard icon={<UserCheck size={18} />} label="Active Users"     value={stats.activeUsers}        accent="#2FB67C" />
        <KpiCard icon={<UserX size={18} />} label="Inactive Users"      value={stats.inactiveUsers}      accent="var(--txt-dim)" />
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

        {/* Recent audit events */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>Recent Activity</div>
          {stats.recentAuditEvents.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No recent activity</div>
            : stats.recentAuditEvents.map((event) => (
              <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                  {humanAction(event)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {formatRelative(event.occurredAt)}
                </div>
              </div>
            ))}
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
