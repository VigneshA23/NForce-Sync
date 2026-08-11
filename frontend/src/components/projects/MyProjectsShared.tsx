import { useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, Search, X } from 'lucide-react';
import type { ProjectFullDto } from '../../api/projects';

// ── Shared "My Projects" building blocks ─────────────────────────────────────────
// Extracted from pages/lead/MyProjects.tsx so the Employee "My Projects" page (and any
// future role that needs the same read-only project list/detail UI) can reuse the exact
// same components/styles instead of duplicating them. Team Lead-only concerns (category
// management, project details' assigned-employees roster) stay in pages/lead/MyProjects.tsx.

export type ProjectStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ON_HOLD';

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--txt)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

export const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 550,
  color: 'var(--txt-mut)', marginBottom: 5, letterSpacing: '0.03em',
};

export const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--txt-dim)',
  textAlign: 'left',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: 'var(--raised)',
  borderBottom: '1px solid var(--line)',
  whiteSpace: 'nowrap',
};

export const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  color: 'var(--txt)',
};

export const detailLabelStyle: React.CSSProperties = { ...labelStyle, marginBottom: 0 };
export const detailValueStyle: React.CSSProperties = { fontSize: 13, color: 'var(--txt)' };

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  ACTIVE:    { color: '#2FB67C', label: 'Active' },
  ON_HOLD:   { color: '#E0A93B', label: 'On Hold' },
  COMPLETED: { color: '#4C8DD6', label: 'Completed' },
  INACTIVE:  { color: '#9BA1AC', label: 'Inactive' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { color: '#9BA1AC', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500,
      background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
      color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px', borderRadius: 7, marginBottom: 14,
      background: 'rgba(228,55,61,.10)', border: '1px solid rgba(228,55,61,.25)',
      fontSize: 12, color: 'var(--risk)',
    }} role="alert">
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      {message}
    </div>
  );
}

/** ISO `yyyy-MM-dd` → `DD-MM-YYYY`; a plain hyphen when absent. */
export function fmtDateDMY(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

// ── Search box (mirrors pages/pm/ProjectsAllocation.tsx search pattern) ─────────

export function SearchBox({ value, onChange, placeholder, ariaLabel }: {
  value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string;
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%', maxWidth: 320 }}>
      <Search
        size={13} aria-hidden="true"
        style={{ position: 'absolute', left: 10, color: 'var(--txt-dim)', pointerEvents: 'none' }}
      />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        style={{ ...inputStyle, paddingLeft: 30, paddingRight: value !== '' ? 30 : 12, fontWeight: 400 }}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            position: 'absolute', right: 8, background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'var(--txt-dim)', padding: 4, display: 'flex',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--txt)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt-dim)'; }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ── Status filter select (toolbar, alongside search) ────────────────────────────

export function StatusFilterSelect({ value, onChange, options, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <label style={{ fontSize: 12, fontWeight: 550, color: 'var(--txt-mut)', whiteSpace: 'nowrap' }}>
        Status
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{ ...inputStyle, width: 'auto', minWidth: 130, fontWeight: 400 }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Projects panel ──────────────────────────────────────────────────────────────

export function ProjectsPanel({
  projects, isPending, isError, isRefreshing, onRefresh, selectedProjectId, onSelect, onOpenDetails,
}: {
  projects: ProjectFullDto[];
  isPending: boolean;
  isError: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  selectedProjectId: number | undefined;
  onSelect: (id: number) => void;
  onOpenDetails: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('ALL');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter(p => {
      const matchesSearch = term === ''
        || p.name.toLowerCase().includes(term)
        || p.code.toLowerCase().includes(term)
        || (p.client ?? '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
          Assigned Projects{projects.length > 0 ? ` (${projects.length})` : ''}
        </span>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={isRefreshing ? 'Refreshing…' : 'Refresh'}
          title="Refresh"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1px solid var(--line2)',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            color: 'var(--txt-mut)', padding: '7px 10px', borderRadius: 6, fontSize: 12,
            opacity: isRefreshing ? 0.7 : 1,
          }}
        >
          <RefreshCw size={13} aria-hidden="true" style={isRefreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
        </button>
      </div>

      {!isPending && !isError && projects.length > 0 && (
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 260px', maxWidth: 320 }}>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search assigned projects..."
              ariaLabel="Search assigned projects by name, client, or code"
            />
          </div>
          <StatusFilterSelect
            value={statusFilter}
            onChange={v => setStatusFilter(v as ProjectStatusFilter)}
            ariaLabel="Filter assigned projects by status"
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'ON_HOLD', label: 'On Hold' },
            ]}
          />
        </div>
      )}

      {isPending && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6 }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load your projects.</div>
          <button onClick={onRefresh} disabled={isRefreshing} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6,
            color: 'var(--txt)', fontSize: 12, cursor: isRefreshing ? 'not-allowed' : 'pointer',
          }}>
            <RefreshCw size={13} aria-hidden="true" style={isRefreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            {isRefreshing ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {!isPending && !isError && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Project</th>
              <th style={thStyle}>Client</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Start Date</th>
              <th style={thStyle}>End Date</th>
              <th style={thStyle}>Team Size</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No projects are currently assigned to you.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                  No matching projects found.
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  style={{
                    cursor: 'pointer',
                    background: p.id === selectedProjectId ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onOpenDetails(p.id); }}
                      title="View project details"
                      style={{
                        background: 'none', border: 'none', padding: 0, margin: 0,
                        cursor: 'pointer', textAlign: 'left', font: 'inherit',
                        color: 'var(--brand)', fontWeight: 500,
                        textDecoration: 'underline',
                        textDecorationColor: 'color-mix(in srgb, var(--brand) 40%, transparent)',
                      }}
                    >
                      {p.name}
                    </button>
                    <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>
                      {p.code}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{p.client ?? 'Internal'}</td>
                  <td style={tdStyle}><StatusBadge status={p.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{fmtDateDMY(p.startDate)}</td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{p.endDate ? fmtDateDMY(p.endDate) : 'Ongoing'}</td>
                  <td style={{ ...tdStyle, color: 'var(--txt-mut)' }}>{p.allocatedHeadcount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
