import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { searchUsers } from '../api/admin';

/**
 * Super Admin-only control shown at the top of a reused PM/Team Lead operational page. Lets a
 * Super Admin narrow their read-only, system-wide view down to one specific Project Manager's
 * or Team Lead's data — the same shape of scoping that PM/Team Lead already see for themselves.
 * Never rendered for a PM/Team Lead/Employee caller, and never changes what they can do.
 *
 * See ApprovalService/TeamLeadService/ProjectDashboardService's `pmId`/`teamLeadId`/`managerId`
 * params on the backend (Super Admin Reportee Views enhancement) — this is purely the picker
 * for those, no new business logic lives here.
 */
export function ReporteeScopePicker({ role, label, value, onChange }: {
  role: 'PM' | 'MANAGER';
  label: string;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ['users', 'search', role],
    queryFn: () => searchUsers({ role }),
    staleTime: 5 * 60_000,
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'color-mix(in srgb, var(--accent, #A78BFA) 10%, var(--panel))',
      border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', marginBottom: 16,
    }}>
      <Shield size={15} aria-hidden="true" style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: 'var(--txt-dim)', fontWeight: 600 }}>
        Super Admin Reportee View:
      </span>
      <select
        aria-label={`Filter by ${label}`}
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        style={{
          background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6,
          padding: '6px 10px', color: 'var(--txt)', fontSize: 12.5, outline: 'none',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <option value="">All {label}s (system-wide)</option>
        {(data ?? []).map(u => (
          <option key={u.id} value={u.id}>{u.fullName} ({u.employeeCode})</option>
        ))}
      </select>
      <span style={{ fontSize: 11.5, color: 'var(--txt-dim)' }}>
        Read-only visibility. It does not change who owns or approves this data.
      </span>
    </div>
  );
}
