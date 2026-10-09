import { ClipboardList, Clock, Gauge, Users } from 'lucide-react';
import { KpiCard } from './KpiCard';
import { averageHoursPerEmployee, formatAverageHours, formatKpiHours } from '../lib/eodReportKpis';

/**
 * The four summary tiles above the EOD by employee list (Super Admin EOD Reports): Employees, EOD
 * entries, Hours logged, Avg hrs / employee. Built on the existing KpiCard and design tokens. They
 * read "—" until a range has produced a response, so a missing range never looks like zero.
 */
export function EodReportKpis({ summary }: {
  summary: { employeeCount: number; entryCount: number; totalHours: number } | undefined;
}) {
  const dash = '—';
  const avg = summary ? averageHoursPerEmployee(summary.totalHours, summary.employeeCount) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
      <KpiCard
        icon={<Users size={18} aria-hidden="true" />} accent="var(--info)" label="Employees"
        value={summary ? summary.employeeCount : dash}
      />
      <KpiCard
        icon={<ClipboardList size={18} aria-hidden="true" />} accent="var(--brand)" label="EOD entries"
        value={summary ? summary.entryCount : dash}
      />
      <KpiCard
        icon={<Clock size={18} aria-hidden="true" />} accent="var(--ok)" label="Hours logged"
        value={summary ? formatKpiHours(summary.totalHours) : dash}
      />
      <KpiCard
        icon={<Gauge size={18} aria-hidden="true" />} accent="var(--warn)" label="Avg hrs / employee"
        value={avg === null ? dash : formatAverageHours(avg)}
      />
    </div>
  );
}
