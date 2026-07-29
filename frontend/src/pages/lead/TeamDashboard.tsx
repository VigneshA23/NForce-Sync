import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Users, RefreshCw } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useDashboardStats, type DashboardStatsDto, type MemberStatusDto } from '../../api/team';
import { RULES, fmtPct } from '../../lib/rules';

// ── helpers ────────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function teamHealth(s: DashboardStatsDto): 'healthy' | 'at-risk' | 'critical' {
  const submissionRate = s.teamSize > 0 ? s.membersSubmittedToday / s.teamSize : 0;
  const issues = [
    s.blockersCount > 0,
    s.pendingApprovalsCount > 5,
    submissionRate < 0.5,
    s.teamUtilizationAvg !== null &&
      (s.teamUtilizationAvg < RULES.util.under || s.teamUtilizationAvg > RULES.util.over),
  ].filter(Boolean).length;
  if (issues >= 3) return 'critical';
  if (issues >= 1) return 'at-risk';
  return 'healthy';
}

const HEALTH = {
  healthy:  { color: 'var(--ok)',   label: 'Healthy' },
  'at-risk':{ color: 'var(--warn)', label: 'At Risk' },
  critical: { color: 'var(--risk)', label: 'Critical' },
};

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  SUBMITTED:          { color: 'var(--info)', label: 'Submitted' },
  APPROVED:           { color: 'var(--ok)',   label: 'Approved' },
  REJECTED:           { color: 'var(--risk)', label: 'Rejected' },
  CHANGES_REQUESTED:  { color: 'var(--warn)', label: 'Changes Req.' },
  DRAFT:              { color: 'var(--txt-dim)', label: 'Draft' },
  MISSING:            { color: 'var(--txt-dim)', label: 'Missing' },
};

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

// ── KPI card ───────────────────────────────────────────────────────────────────

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

// ── member row ─────────────────────────────────────────────────────────────────

function MemberRow({ member, isLast }: { member: MemberStatusDto; isLast: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--line)',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'var(--raised2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'var(--txt-mut)',
        fontFamily: '"Inter", sans-serif',
      }}>
        {member.fullName.split(' ').map(w => w[0]).slice(0, 2).join('')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.fullName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
          {member.employeeCode}
        </div>
      </div>
      <StatusBadge status={member.todayStatus} />
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function TeamDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isPending, isError, refetch } = useDashboardStats(user?.id);

  const today = todayISO();
  const health = stats ? teamHealth(stats) : null;
  const hcfg   = health ? HEALTH[health] : null;

  const needsAttention = stats?.members.filter(
    m => m.todayStatus === 'MISSING' || m.todayStatus === 'REJECTED' || m.todayStatus === 'CHANGES_REQUESTED',
  ) ?? [];

  if (isPending) {
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

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>Team Dashboard</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load dashboard.</div>
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

  const submissionRate = stats!.teamSize > 0
    ? `${stats!.membersSubmittedToday}/${stats!.teamSize}`
    : '—';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            Team Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            {stats!.teamSize} member{stats!.teamSize !== 1 ? 's' : ''} · {today}
          </p>
        </div>
        {hcfg && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 20,
            background: `color-mix(in srgb, ${hcfg.color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${hcfg.color} 30%, transparent)`,
            fontSize: 12, fontWeight: 600, color: hcfg.color,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: hcfg.color }} aria-hidden="true" />
            Team {hcfg.label}
          </div>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard
          icon={<Clock size={16} />}
          label="Pending Approvals"
          value={stats!.pendingApprovalsCount}
          accent={stats!.pendingApprovalsCount > 0 ? 'var(--warn)' : 'var(--txt)'}
          action={stats!.pendingApprovalsCount > 0 ? 'Review' : undefined}
          onAction={stats!.pendingApprovalsCount > 0 ? () => navigate('/team/approvals') : undefined}
        />
        <KpiCard
          icon={<CheckCircle2 size={16} />}
          label="Avg Utilization"
          value={fmtPct(stats!.teamUtilizationAvg)}
          accent={
            stats!.teamUtilizationAvg === null ? 'var(--txt-dim)'
            : stats!.teamUtilizationAvg < RULES.util.under ? 'var(--warn)'
            : stats!.teamUtilizationAvg > RULES.util.over ? 'var(--risk)'
            : 'var(--ok)'
          }
        />
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="Active Blockers"
          value={stats!.blockersCount}
          accent={stats!.blockersCount > 0 ? 'var(--risk)' : 'var(--txt)'}
          action={stats!.blockersCount > 0 ? 'View' : undefined}
          onAction={stats!.blockersCount > 0 ? () => navigate('/team/blockers') : undefined}
        />
        <KpiCard
          icon={<Users size={16} />}
          label="Submitted Today"
          value={submissionRate}
          accent="var(--txt)"
        />
      </div>

      {/* Two-column: members + needs attention */}
      <div style={{ display: 'grid', gridTemplateColumns: needsAttention.length > 0 ? '1fr 320px' : '1fr', gap: 16 }}>
        {/* Team member list */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Team Members</div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Today's status</div>
          </div>
          {stats!.members.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
              No team members assigned yet.
            </div>
          ) : (
            stats!.members.map((m, i) => (
              <MemberRow key={m.id} member={m} isLast={i === stats!.members.length - 1} />
            ))
          )}
        </Card>

        {/* Needs attention */}
        {needsAttention.length > 0 && (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Needs Attention</div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginTop: 2 }}>{needsAttention.length} member{needsAttention.length !== 1 ? 's' : ''}</div>
            </div>
            {needsAttention.map((m, i) => (
              <MemberRow key={m.id} member={m} isLast={i === needsAttention.length - 1} />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
