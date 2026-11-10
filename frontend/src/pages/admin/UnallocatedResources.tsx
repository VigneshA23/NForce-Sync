import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Users, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import { PageHeader } from '../../components/PageHeader';
import { tableThStyle, tableTdStyle, tableCardStyle } from '../../lib/tableStyles';
import { formatDate, toLocalISODate, todayISO } from '../../lib/date';
import { getExecutiveDashboard } from '../../api/executive';
import { btnSecondary } from '../../lib/uiStyles';
import { EmptyState } from '../../components/EmptyState';

function firstOfMonthISO(): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
}

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: 'Employee', LEAD: 'Team Lead', PM: 'Project Manager', SUPERADMIN: 'Super Admin',
};

/** Drill-through target for the Executive Dashboard's "Unallocated Resources" tile — active
 *  employees with no active project allocation for the same date range that tile was showing.
 *  Reuses the executive dashboard summary call rather than a new endpoint, since the list is
 *  just the detail behind a count that endpoint already computes. */
export default function UnallocatedResources() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') || firstOfMonthISO();
  const to = searchParams.get('to') || todayISO();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['executive', 'dashboard', from, to],
    queryFn: () => getExecutiveDashboard(from, to),
    staleTime: 60 * 1000,
  });

  return (
    <div>
      <PageHeader
        title="Unallocated Resources"
        subtitle={<>Active employees with no active project allocation, {formatDate(from)} – {formatDate(to)}.</>}
      />

      {isPending && <GlobalLoader fullScreen={false} />}

      {isError && !isPending && (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load unallocated resources.</div>
          <button
            onClick={() => refetch()}
            className="nf-btn nf-btn--secondary"
            style={btnSecondary}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      )}

      {data && (() => {
        const unallocated = data.allocation.unallocatedResources ?? [];
        return (
        <Card style={{ ...tableCardStyle, padding: 0 }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={14} color="var(--txt-mut)" aria-hidden="true" />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              {unallocated.length} unallocated employee{unallocated.length === 1 ? '' : 's'}
            </div>
          </div>
          {unallocated.length === 0 ? (
            <div style={{ padding: 16 }}>
              <EmptyState icon={CheckCircle2} tone="var(--ok)" title="Every active employee has an active project allocation in this range." />
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: 560 }}>
              <table className="nf-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Employee Name', 'Employee ID', 'Role'].map(h => (
                      <th key={h} style={{
                        ...tableThStyle,
                        position: 'sticky', top: 0, zIndex: 1,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unallocated.map(r => (
                    <tr key={r.employeeId}>
                      <td style={{ ...tableTdStyle, color: 'var(--txt)', fontWeight: 500 }}>{r.employeeName}</td>
                      <td style={{ ...tableTdStyle, color: 'var(--txt-mut)' }}>{r.employeeCode}</td>
                      <td style={{ ...tableTdStyle, color: 'var(--txt-mut)' }}>{ROLE_LABEL[r.role] ?? r.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        );
      })()}
    </div>
  );
}
