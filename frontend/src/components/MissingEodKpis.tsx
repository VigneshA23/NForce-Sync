import { AlertTriangle, CalendarX, ShieldAlert, Users } from 'lucide-react';
import { KpiCard } from './KpiCard';

/**
 * Summary tiles above the Missing EOD list (EOD Reports, PM Reports, Lead Reports). The report only
 * lists employees with at least one missing day, so "Employees" counts people with gaps, and the
 * At risk / Missing split follows the same status the rows show. Reads "—" until a range has produced
 * a response, and a placeholder bar while that first response loads.
 */
export function MissingEodKpis({ summary, loading = false }: {
  summary: { employeeCount: number; totalMissingDays: number; employees: { status: 'MISSING' | 'AT_RISK' }[] } | undefined;
  loading?: boolean;
}) {
  const dash = '—';
  const busy = loading && !summary;
  const atRisk = summary ? summary.employees.filter(e => e.status === 'AT_RISK').length : 0;
  const missing = summary ? summary.employees.filter(e => e.status === 'MISSING').length : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
      <KpiCard
        icon={<Users size={18} aria-hidden="true" />} accent="var(--info)" label="Employees with gaps"
        title="Employees with at least one missing EOD in the selected range"
        loading={busy} value={summary ? summary.employeeCount : dash}
      />
      <KpiCard
        icon={<CalendarX size={18} aria-hidden="true" />} accent="var(--brand)" label="Missing EOD days"
        title="Working days without an EOD, across all listed employees"
        loading={busy} value={summary ? summary.totalMissingDays : dash}
      />
      <KpiCard
        icon={<ShieldAlert size={18} aria-hidden="true" />} accent="var(--risk)" label="At risk"
        title="Employees whose missing share has reached the at-risk threshold"
        loading={busy} value={summary ? atRisk : dash}
      />
      <KpiCard
        icon={<AlertTriangle size={18} aria-hidden="true" />} accent="var(--warn)" label="Missing"
        title="Employees with missing EODs below the at-risk threshold"
        loading={busy} value={summary ? missing : dash}
      />
    </div>
  );
}
