import { ClipboardList, Clock, Gauge, Users } from 'lucide-react';
import { KpiCard } from './KpiCard';
import { averageHoursPerEmployee, formatAverageHours, formatKpiHours } from '../lib/eodReportKpis';

/**
 * The four summary tiles above the EOD by employee list (EOD Reports, PM Reports, Lead Reports):
 * Employees, EOD entries, Approved hours, Avg hrs / employee. Built on the existing KpiCard and design
 * tokens. They read "—" until a range has produced a response (a missing range never looks like zero)
 * and show a placeholder bar while that first response is loading.
 *
 * Reconciliation: "Employees" is every in-scope employee, with or without entries, and the average
 * divides by that same number (224 h / 23 employees = 9.7), so the tiles agree with each other.
 * Entries and hours count APPROVED entries only, which the labels say.
 */
export function EodReportKpis({ summary, loading = false }: {
  summary: { employeeCount: number; entryCount: number; totalHours: number } | undefined;
  /** First response for the current range still in flight. */
  loading?: boolean;
}) {
  const dash = '—';
  const busy = loading && !summary;
  const avg = summary ? averageHoursPerEmployee(summary.totalHours, summary.employeeCount) : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
      <KpiCard
        icon={<Users size={18} aria-hidden="true" />} accent="var(--info)" label="Employees"
        title="Employees in scope for the selected filters, with or without EOD entries"
        loading={busy} value={summary ? summary.employeeCount : dash}
      />
      <KpiCard
        icon={<ClipboardList size={18} aria-hidden="true" />} accent="var(--brand)" label="Approved EOD entries"
        title="Approved EOD entries in the selected range"
        loading={busy} value={summary ? summary.entryCount : dash}
      />
      <KpiCard
        icon={<Clock size={18} aria-hidden="true" />} accent="var(--ok)" label="Approved hours"
        title="Hours from approved EOD entries only — pending and rejected entries are not counted"
        loading={busy} value={summary ? formatKpiHours(summary.totalHours) : dash}
      />
      <KpiCard
        icon={<Gauge size={18} aria-hidden="true" />} accent="var(--warn)" label="Avg hrs / employee"
        title="Approved hours ÷ employees in scope"
        loading={busy} value={avg === null ? dash : formatAverageHours(avg)}
      />
    </div>
  );
}
