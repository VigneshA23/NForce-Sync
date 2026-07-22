import { useQuery } from '@tanstack/react-query';
import { Eye, RefreshCw } from 'lucide-react';
import { listRoles } from '../../api/admin';
import { toRole } from '../../api/auth';
import { ROLE_COLORS } from '../../lib/nav';

export default function RolesAccess() {
  const { data: roles, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 24, fontWeight: 700,
          color: 'var(--txt)', margin: '0 0 4px',
          letterSpacing: '-0.01em',
        }}>
          Roles &amp; Access
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          System roles and their permission levels. Role permissions are currently fixed — configurable permission editing is a future enhancement.
        </p>
      </div>

      {/* Info note */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 8, marginBottom: 20,
        background: 'rgba(76,141,214,.08)',
        border: '1px solid rgba(76,141,214,.2)',
        fontSize: 12, color: '#7BB3E0',
      }}>
        <Eye size={14} aria-hidden="true" />
        This is informational. Role assignments are managed through User Management.
      </div>

      {isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0,1,2,3,4,5,6,7].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{
          padding: '32px 20px', textAlign: 'center',
          background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load roles.</div>
          <button
            onClick={() => refetch()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 12, cursor: 'pointer' }}
          >
            <RefreshCw size={13} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {roles && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {roles.map((role) => {
            const frontendRole = toRole(role.key);
            const color = ROLE_COLORS[frontendRole] ?? '#6B7280';
            return (
              <div
                key={role.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                }}
              >
                {/* Role color indicator */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                </div>

                {/* Role info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                      {role.displayName}
                    </span>
                    {role.isReadOnly && (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        padding: '2px 7px', borderRadius: 20,
                        background: 'rgba(224,169,59,.12)',
                        border: '1px solid rgba(224,169,59,.3)',
                        color: '#E0A93B',
                        letterSpacing: '0.04em',
                      }}>
                        READ ONLY
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt-mut)', lineHeight: 1.5 }}>
                    {role.description}
                  </div>
                </div>

                {/* Key badge */}
                <div style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10, color: 'var(--txt-dim)',
                  background: 'var(--raised2)',
                  border: '1px solid var(--line2)',
                  padding: '3px 8px', borderRadius: 4,
                  flexShrink: 0,
                }}>
                  {role.key}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
