import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Users } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { GlobalLoader } from '../../components/GlobalLoader';
import { formatDate, toLocalISODate, todayISO } from '../../lib/date';
import { getExecutiveDashboard } from '../../api/executive';

function firstOfMonthISO(): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
}

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: 'Employee', LEAD: 'Team Lead', PM: 'Project Manager', DM: 'Delivery Manager',
  HR: 'HR', FINANCE: 'Finance', LEADERSHIP: 'Leadership', SUPERADMIN: 'Super Admin',
};

/** Drill-through target for the Executive Dashboard's "Unallocated Resources" tile — active
 *  employees with no active project allocation for the same date range that tile was showing.
 *  Reuses the executive dashboard summary call rather than a new endpoint, since the list is
 *  just the detail behind a count that endpoint already computes. */
export default function UnallocatedResources() {
  const navigate = useNavigate();
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
      <button
        onClick={() => navigate('/admin/executive-dashboard')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
          background: 'none', border: 'none', color: 'var(--brand-bright)', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', padding: 0,
        }}
      >
        <ArrowLeft size={14} aria-hidden="true" /> Back to Executive Dashboard
      </button>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Unallocated Resources
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          Active employees with no active project allocation, {formatDate(from)} – {formatDate(to)}.
        </p>
      </div>

      {isPending && <GlobalLoader fullScreen={false} />}

      {isError && !isPending && (
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load unallocated resources.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      )}

      {data && (() => {
        const unallocated = data.allocation.unallocatedResources ?? [];
        return (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={14} color="var(--txt-mut)" aria-hidden="true" />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              {unallocated.length} unallocated employee{unallocated.length === 1 ? '' : 's'}
            </div>
          </div>
          {unallocated.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--txt-dim)', fontSize: 13 }}>
              Every active employee has an active project allocation in this range.
            </div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: 560 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Employee', 'Employee Code', 'Role'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 20px', color: 'var(--txt-dim)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
                        position: 'sticky', top: 0, zIndex: 1, background: 'var(--panel)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unallocated.map(r => (
                    <tr key={r.employeeId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 20px', color: 'var(--txt)', fontWeight: 500 }}>{r.employeeName}</td>
                      <td style={{ padding: '10px 20px', color: 'var(--txt-mut)' }}>{r.employeeCode}</td>
                      <td style={{ padding: '10px 20px', color: 'var(--txt-mut)' }}>{ROLE_LABEL[r.role] ?? r.role}</td>
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
