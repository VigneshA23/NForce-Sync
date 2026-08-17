import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { listAuditLog } from '../../api/admin';
import type { AuditLogDto, AuditFilters } from '../../api/admin';
import { formatAuditDate, auditActionBadgeStyle } from '../../lib/auditLog';

const ENTITY_TYPES = ['APP_USER', 'EOD_ENTRY', 'PASSWORD_RESET_TOKEN'];
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE', 'APPROVE', 'REJECT', 'CHANGES_REQUESTED', 'PASSWORD_RESET'];
const PAGE_SIZE = 25;

function actionBadge(action: string) {
  const style = auditActionBadgeStyle(action);
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 20,
      background: style.bg, color: style.color,
      letterSpacing: '0.05em', fontFamily: '"JetBrains Mono", monospace',
      whiteSpace: 'nowrap',
    }}>
      {action.replace('_', ' ')}
    </span>
  );
}

function JsonDiff({ label, raw }: { label: string; raw: string | null }) {
  if (!raw) return <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{label}: —</div>;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = raw; }

  const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed as Record<string, unknown>)
    : null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--txt-dim)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {entries ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px',
          padding: '10px 12px', background: 'var(--shell)',
          borderRadius: 6, border: '1px solid var(--line)',
        }}>
          {entries.map(([k, v]) => (
            k !== 'id' && k !== 'status' ? (
              <>
                <span key={`k-${k}`} style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap' }}>{k}</span>
                <span key={`v-${k}`} style={{ fontSize: 11, color: 'var(--txt-mut)', wordBreak: 'break-all' }}>{String(v ?? '—')}</span>
              </>
            ) : null
          ))}
        </div>
      ) : (
        <pre style={{ fontSize: 11, color: 'var(--txt-mut)', background: 'var(--shell)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {raw}
        </pre>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogDto }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.beforeValue || entry.afterValue;

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--line)' }}>
        <td style={tdStyle}>
          <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'var(--txt-dim)', whiteSpace: 'nowrap' }}>
            {formatAuditDate(entry.occurredAt)}
          </span>
        </td>
        <td style={tdStyle}>
          <span style={{ fontSize: 12, color: 'var(--txt)' }}>{entry.actorName ?? '—'}</span>
          {entry.actorId && (
            <span style={{ fontSize: 10, color: 'var(--txt-dim)', marginLeft: 6, fontFamily: '"JetBrains Mono", monospace' }}>
              #{entry.actorId}
            </span>
          )}
        </td>
        <td style={tdStyle}>{actionBadge(entry.action)}</td>
        <td style={tdStyle}>
          <span style={{ fontSize: 12, color: 'var(--txt-mut)' }}>
            {entry.entityType}
            {entry.entityId != null && (
              <span style={{ color: 'var(--txt-dim)', marginLeft: 6, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
                #{entry.entityId}
              </span>
            )}
          </span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {hasDetail && (
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', background: 'var(--raised2)',
                border: '1px solid var(--line2)', borderRadius: 5,
                fontSize: 11, color: 'var(--txt-mut)', cursor: 'pointer',
              }}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
            >
              Details {expanded ? <ChevronUp size={11} aria-hidden="true" /> : <ChevronDown size={11} aria-hidden="true" />}
            </button>
          )}
        </td>
      </tr>
      {expanded && hasDetail && (
        <tr>
          <td colSpan={5} style={{ padding: '12px 16px', background: 'var(--raised)', borderBottom: '1px solid var(--line)' }}>
            <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <JsonDiff label="Before" raw={entry.beforeValue} />
              <JsonDiff label="After"  raw={entry.afterValue} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 12,
  verticalAlign: 'top',
};

export default function AuditLog() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  // Seeds the "from" filter when arriving via the dashboard's "View all N →" link,
  // so the count shown there matches what's actually displayed here.
  const [filters, setFilters] = useState<Pick<AuditFilters, 'entityType' | 'action' | 'actorName' | 'from' | 'to'>>(() => {
    const from = searchParams.get('from');
    return from ? { from } : {};
  });

  const queryFilters: AuditFilters = { ...filters, page, size: PAGE_SIZE };
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin', 'audit', queryFilters],
    queryFn: () => listAuditLog(queryFilters),
    placeholderData: (prev) => prev,
  });

  function handleFilterChange(key: keyof typeof filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
    setPage(0);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 24, fontWeight: 700, color: 'var(--txt)',
          margin: '0 0 4px', letterSpacing: '-0.01em',
        }}>
          Audit Log
        </h1>
        <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
          All system actions, ordered newest first.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end',
        padding: '14px 16px', background: 'var(--panel)',
        border: '1px solid var(--line)', borderRadius: 10,
      }}>
        <div>
          <label style={labelStyle} htmlFor="et-filter">Entity type</label>
          <select
            id="et-filter"
            value={filters.entityType ?? ''}
            onChange={(e) => handleFilterChange('entityType', e.target.value)}
            style={selectStyle}
          >
            <option value="">All types</option>
            {ENTITY_TYPES.map((et) => <option key={et} value={et}>{et}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="action-filter">Action</label>
          <select
            id="action-filter"
            value={filters.action ?? ''}
            onChange={(e) => handleFilterChange('action', e.target.value)}
            style={selectStyle}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="actor-filter">Actor name</label>
          <input
            id="actor-filter"
            type="text"
            placeholder="Search by name…"
            value={filters.actorName ?? ''}
            onChange={(e) => handleFilterChange('actorName', e.target.value)}
            style={{ ...selectStyle, minWidth: 160 }}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="from-filter">From</label>
          <input
            id="from-filter"
            type="datetime-local"
            value={filters.from?.slice(0, 16) ?? ''}
            onChange={(e) => handleFilterChange('from', e.target.value ? `${e.target.value}:00Z` : '')}
            style={selectStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="to-filter">To</label>
          <input
            id="to-filter"
            type="datetime-local"
            value={filters.to?.slice(0, 16) ?? ''}
            onChange={(e) => handleFilterChange('to', e.target.value ? `${e.target.value}:00Z` : '')}
            style={selectStyle}
          />
        </div>
        <button
          onClick={() => { setFilters({}); setPage(0); }}
          style={{ ...selectStyle, cursor: 'pointer', color: 'var(--txt-mut)', border: '1px solid var(--line2)' }}
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
        {isPending && (
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
            ))}
          </div>
        )}

        {isError && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--risk)', marginBottom: 12 }}>Failed to load audit log.</div>
            <button onClick={() => refetch()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 12, cursor: 'pointer' }}>
              <RefreshCw size={13} aria-hidden="true" /> Retry
            </button>
          </div>
        )}

        {data && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'var(--raised)', borderBottom: '1px solid var(--line)' }}>
                  {['Timestamp', 'Actor', 'Action', 'Entity', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--txt-dim)', textAlign: 'left', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.content.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', fontSize: 13, color: 'var(--txt-dim)' }}>
                      No audit events match your filters.
                    </td>
                  </tr>
                ) : (
                  data.content.map((entry) => <AuditRow key={entry.id} entry={entry} />)
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: '1px solid var(--line)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--txt-dim)', fontVariantNumeric: 'tabular-nums' }}>
              {data.totalElements} total · page {data.number + 1} of {data.totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={data.number === 0}
                style={pageBtnStyle(data.number === 0)}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={data.number >= data.totalPages - 1}
                style={pageBtnStyle(data.number >= data.totalPages - 1)}
                aria-label="Next page"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 550,
  color: 'var(--txt-dim)', marginBottom: 4, letterSpacing: '0.04em',
};

const selectStyle: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--shell)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  color: 'var(--txt)',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
};

const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30,
  background: disabled ? 'var(--raised)' : 'var(--raised2)',
  border: '1px solid var(--line2)',
  borderRadius: 6,
  color: disabled ? 'var(--txt-dim)' : 'var(--txt)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});
