import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Users, UserCheck, UserX, Activity, ArrowRight, RefreshCw } from 'lucide-react';
import { getAdminStats } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS, ROLE_LABELS } from '../../lib/nav';
import { describeAuditEvent, formatRelative, AUDIT_CATEGORY_ICONS, AUDIT_CATEGORY_LABELS } from '../../lib/auditLog';
import { GlobalLoader } from '../../components/GlobalLoader';

// ── Shared primitives ─────────────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
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

function Card({ children, style, onClick, onMouseEnter, onMouseLeave }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: '20px',
        ...style,
      }}
    >
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
  onClick?: () => void;
}

function KpiCard({ icon, label, value, accent = 'var(--txt)', onClick }: KpiProps) {
  const [hover, setHover] = useState(false);
  return (
    <Card
      onClick={onClick}
      onMouseEnter={onClick ? () => setHover(true) : undefined}
      onMouseLeave={onClick ? () => setHover(false) : undefined}
      style={onClick ? {
        cursor: 'pointer',
        borderColor: hover ? 'var(--txt-dim)' : 'var(--line)',
        background: hover ? 'var(--raised2)' : 'var(--panel)',
        transition: 'border-color 0.14s, background 0.14s',
      } : undefined}
    >
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
        {/* Signals the tile is clickable — otherwise nothing here reads as a button on
            first glance, only on hover, which a touch/first-time user would never see. */}
        {onClick && (
          <ArrowRight size={14} aria-hidden="true" style={{ color: 'var(--txt-dim)', marginTop: 3, flexShrink: 0 }} />
        )}
      </div>
      <div style={{
        fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
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
        <PageHeader title="Admin Dashboard" subtitle="Platform health at a glance." />
        <GlobalLoader fullScreen={false} />
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

  // Both defaulted: a partial stats payload should degrade to an empty section, not blank
  // the page.
  const roleEntries = Object.entries(stats.usersByRole ?? {}).filter(([, v]) => v > 0);
  const recentEvents = stats.recentAuditEvents ?? [];

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Platform health at a glance." />

      {/* KPI row — auto-fit (not auto-fill) so the 4 cards always stretch to fill the full
          row width; auto-fill would keep reserving empty track slots at wide viewports,
          leaving the cards bunched to the left instead of spanning edge-to-edge like the
          two-column row below. With exactly 4 equal cards over 2 equal columns below, the
          middle gap naturally lines up with the row-below split by symmetry. */}
      <div className="nf-r-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard icon={<Users size={18} />}    label="Total Users"          value={stats.totalUsers}         accent="var(--txt)"
          onClick={() => navigate('/admin/users?status=ALL')} />
        <KpiCard icon={<UserCheck size={18} />} label="Active Users"      value={stats.activeUsers}        accent="var(--ok)"
          onClick={() => navigate('/admin/users?status=ACTIVE')} />
        <KpiCard icon={<UserX size={18} />} label="Inactive Users" value={stats.inactiveUsers} accent="var(--txt-dim)"
          onClick={() => navigate('/admin/users?status=INACTIVE')} />
        <KpiCard icon={<Activity size={18} />} label="Audit Events (24h)" value={stats.auditEventsLast24h} accent="var(--info)"
          onClick={() => navigate(`/admin/audit?from=${encodeURIComponent(since24h)}`)} />
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
            height:100% + flex column so the list fills whatever height the grid row
            stretched this card to (matching the taller Users by Role card) instead of
            capping at a fixed maxHeight and leaving blank space above "View all". */}
        <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 16 }}>Recent Activity</div>
          {recentEvents.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No recent activity</div>
            : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 10 }}>
                {recentEvents.map((event) => {
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
              </div>
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
    </div>
  );
}
