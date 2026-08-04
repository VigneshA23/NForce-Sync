import { RefreshCw, Activity, Users, TrendingDown, TrendingUp } from 'lucide-react';
import { todayISO } from '../../lib/date';
import { useOrgUtil } from '../../api/utilization';
import { RULES, utilState, utilColor, fmtPct } from '../../lib/rules';
import { UtilBar, UtilLegend, Distribution } from '../../components/UtilBar';
import { Card, KpiCard } from '../../components/KpiCard';
import type { OrgUtilRowDto } from '../../api/utilization';

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{
        fontFamily: '"Space Grotesk", sans-serif', fontSize: 24, fontWeight: 700,
        color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em',
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

// ── department breakdown ────────────────────────────────────────────────────────

function departmentAverages(rows: OrgUtilRowDto[]) {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const pct = r.snapshot?.utilizationPct;
    if (pct == null) continue;
    const key = r.departmentName ?? 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(pct);
  }
  return Array.from(groups.entries())
    .map(([name, pcts]) => ({
      name,
      avg: pcts.reduce((a, b) => a + b, 0) / pcts.length,
      count: pcts.length,
    }))
    .sort((a, b) => b.count - a.count);
}

function DepartmentRow({ name, avg, count }: { name: string; avg: number; count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, color: 'var(--txt)' }}>{name}</div>
      <UtilBar pct={avg} />
      <div style={{ fontSize: 11, color: 'var(--txt-dim)', textAlign: 'right' }}>{count} emp</div>
    </div>
  );
}

// ── low utilization alerts ───────────────────────────────────────────────────────

function AlertRow({ row }: { row: OrgUtilRowDto }) {
  const pct = row.snapshot?.utilizationPct ?? null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{row.employeeName}</div>
        <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
          {row.employeeCode}{row.departmentName ? ` · ${row.departmentName}` : ''}
        </div>
      </div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: utilColor(pct), fontVariantNumeric: 'tabular-nums' }}>
        {fmtPct(pct)}
      </div>
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────────

export default function HrDashboard() {
  const date = todayISO();
  const { data: rows, isPending, isError, refetch } = useOrgUtil(date);

  if (isPending) {
    return (
      <div>
        <PageHeader title="HR Dashboard" subtitle="Organization-wide utilization, today." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[0, 1, 2].map(i => (
            <Card key={i}><Skel h={36} w={36} /><br /><Skel h={28} w="60%" /><br /><Skel h={12} w="40%" /></Card>
          ))}
        </div>
        <Card><Skel h={200} /></Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="HR Dashboard" subtitle="Organization-wide utilization, today." />
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load utilization data.</div>
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

  const withSnapshot = rows!.filter(r => r.snapshot != null);
  const pcts = withSnapshot.map(r => r.snapshot!.utilizationPct).filter((p): p is number => p != null);
  const avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;

  const underUtilized = withSnapshot
    .filter(r => utilState(r.snapshot!.utilizationPct) === 'under')
    .sort((a, b) => (a.snapshot!.utilizationPct ?? 0) - (b.snapshot!.utilizationPct ?? 0));

  const overUtilized = withSnapshot
    .filter(r => utilState(r.snapshot!.utilizationPct) === 'over')
    .sort((a, b) => (b.snapshot!.utilizationPct ?? 0) - (a.snapshot!.utilizationPct ?? 0));

  const departments = departmentAverages(withSnapshot);

  return (
    <div>
      <PageHeader title="HR Dashboard" subtitle="Organization-wide utilization, today. Only APPROVED hours count." />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard icon={<Activity size={18} />}    label="Org Avg Utilization" value={fmtPct(avgPct)}          accent={utilColor(avgPct)} />
        <KpiCard icon={<Users size={18} />}       label="Active Employees"   value={rows!.length}             accent="var(--txt)" />
        <KpiCard icon={<TrendingDown size={18} />} label={`Under ${RULES.util.under}%`} value={underUtilized.length} accent="var(--warn)" />
        <KpiCard icon={<TrendingUp size={18} />}   label={`Over ${RULES.util.over}%`}   value={overUtilized.length}  accent="var(--risk)" />
      </div>

      {/* Distribution + legend */}
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <Distribution members={withSnapshot} />
        <UtilLegend />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        {/* Department breakdown */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 12 }}>Department Utilization</div>
          {departments.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No data yet</div>
            : departments.map(d => <DepartmentRow key={d.name} {...d} />)}
        </Card>

        {/* Low utilization alerts */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 12 }}>
            Low Utilization Alerts <span style={{ color: 'var(--txt-dim)', fontWeight: 400 }}>({underUtilized.length})</span>
          </div>
          {underUtilized.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--txt-dim)' }}>No one under {RULES.util.under}% today</div>
            : underUtilized.slice(0, 8).map(r => <AlertRow key={r.employeeId} row={r} />)}
        </Card>
      </div>
    </div>
  );
}
