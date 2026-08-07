import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle, Clock, XCircle, ChevronRight, AlertTriangle,
  Search, ArrowUpDown, ChevronLeft,
} from 'lucide-react';
import { listEntries } from '../../api/eod';
import type { EodEntryDto } from '../../api/eod';
import { formatDate as formatDateDDMMYYYY, formatDateTime } from '../../lib/date';

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; label: string; Icon: React.FC<{ size: number }> }> = {
  DRAFT:             { color: '#9BA1AC', label: 'Draft',             Icon: Clock },
  SUBMITTED:         { color: '#4C8DD6', label: 'Submitted',         Icon: Clock },
  APPROVED:          { color: '#2FB67C', label: 'Approved',          Icon: CheckCircle },
  REJECTED:          { color: '#E4373D', label: 'Rejected',          Icon: XCircle },
  MISSED:            { color: '#6B7280', label: 'Missed',            Icon: AlertTriangle },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      background: `${m.color}18`, border: `1px solid ${m.color}40`,
      fontSize: 11, fontWeight: 500, color: m.color, whiteSpace: 'nowrap',
    }}>
      <m.Icon size={11} aria-hidden />
      {m.label}
    </span>
  );
}

// ── Filter options ─────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',                 label: 'All' },
  { value: 'SUBMITTED',        label: 'Submitted' },
  { value: 'APPROVED',         label: 'Approved' },
  { value: 'REJECTED',         label: 'Rejected' },
  { value: 'DRAFT',            label: 'Draft' },
];

const PAGE_SIZE = 10;

// ── Main component ─────────────────────────────────────────────────────────────

export default function EodHistory() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['eod-history', dateFrom, dateTo],
    queryFn:  () => listEntries(undefined, dateFrom || undefined, dateTo || undefined),
  });

  const totalHours = (entry: EodEntryDto) =>
    entry.tasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);

  const projectSummary = (entry: EodEntryDto): string => {
    const codes = Array.from(new Set(entry.tasks.map(t => t.projectCode).filter(Boolean))) as string[];
    if (codes.length === 0) return '—';
    return codes.length === 1 ? codes[0] : `${codes[0]} +${codes.length - 1}`;
  };

  const taskSummary = (entry: EodEntryDto): string => {
    if (entry.tasks.length === 0) return entry.dayType !== 'WORKING_DAY' ? entry.dayType.replace('_', ' ') : '—';
    const labels = entry.tasks.map(t => t.categoryName || t.description || 'Task');
    return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1} more`;
  };

  const filtered = useMemo(() => {
    let rows = statusFilter ? entries.filter(e => e.status === statusFilter) : entries;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(e => {
        const haystack = [
          e.entryDate,
          ...e.tasks.map(t => t.projectCode ?? ''),
          ...e.tasks.map(t => t.categoryName ?? ''),
          ...e.tasks.map(t => t.description ?? ''),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...rows].sort((a, b) =>
      sortDir === 'desc' ? b.entryDate.localeCompare(a.entryDate) : a.entryDate.localeCompare(b.entryDate)
    );
    return sorted;
  }, [entries, statusFilter, search, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const paged = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(0); };
  }

  // Weekday kept (useful in a history list scanned day-by-day), date portion
  // standardized to DD-MM-YYYY.
  function formatDate(iso: string) {
    const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
    return `${weekday}, ${formatDateDDMMYYYY(iso)}`;
  }

  function handleView(entry: EodEntryDto) {
    navigate(`/eod/submit?date=${entry.entryDate}`);
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', background: 'var(--raised2)', border: '1px solid var(--line2)',
          borderRadius: 20, marginBottom: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4C8DD6', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--txt-mut)', letterSpacing: '0.04em' }}>Employee</span>
        </div>
        <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--txt)', margin: 0, letterSpacing: '-0.01em' }}>
          My EOD History
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--txt-mut)' }}>
          All your end-of-day reports, newest first.
        </p>
      </div>

      {/* Toolbar — native select, matching the working filter pattern in admin/AuditLog.tsx */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap',
        padding: '14px 16px', background: 'var(--panel)',
        border: '1px solid var(--line)', borderRadius: 10,
      }}>
        <div>
          <label style={labelStyle} htmlFor="eod-search">Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--txt-dim)' }} aria-hidden />
            <input
              id="eod-search"
              placeholder="Project, category, description…"
              value={search}
              onChange={e => resetPage(setSearch)(e.target.value)}
              style={{ ...selectStyle, paddingLeft: 28, width: 220, cursor: 'text' }}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={e => resetPage(setStatusFilter)(e.target.value)}
            style={selectStyle}
          >
            {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="date-from">From</label>
          <input id="date-from" type="date" value={dateFrom} onChange={e => resetPage(setDateFrom)(e.target.value)} style={{ ...selectStyle, cursor: 'text' }} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="date-to">To</label>
          <input id="date-to" type="date" value={dateTo} onChange={e => resetPage(setDateTo)(e.target.value)} style={{ ...selectStyle, cursor: 'text' }} />
        </div>
        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          title="Toggle sort order"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 10px', background: 'var(--shell)', border: '1px solid var(--line2)',
            borderRadius: 6, color: 'var(--txt-mut)', fontSize: 12, cursor: 'pointer',
          }}
        >
          <ArrowUpDown size={12} /> {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
        <span style={{ marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-dim)' }}>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[100, 85, 90, 78].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 56, width: `${w}%`, borderRadius: 8 }} />
          ))}
        </div>
      ) : isError ? (
        <div style={{
          padding: '20px 24px', borderRadius: 8,
          background: 'rgba(228,55,61,.08)', border: '1px solid rgba(228,55,61,.2)',
          fontSize: 13, color: 'var(--risk)',
        }}>
          Failed to load history. Please refresh.
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilter={!!statusFilter || !!search || !!dateFrom || !!dateTo}
          onClear={() => { setStatusFilter(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(0); }}
        />
      ) : (
        <div style={{
          background: 'var(--panel)', border: '1px solid var(--line)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 1.5fr 70px 1fr 1fr 32px',
            padding: '8px 16px', borderBottom: '1px solid var(--line)',
            gap: 12,
          }}>
            {['Date', 'Project', 'Task Summary', 'Hours', 'Status', 'Submitted at', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {paged.map((entry, i) => (
            <div
              key={entry.id}
              onClick={() => handleView(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleView(entry)}
              style={{
                display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 1.5fr 70px 1fr 1fr 32px',
                padding: '12px 16px', gap: 12, alignItems: 'center',
                borderBottom: i < paged.length - 1 ? '1px solid var(--line)' : 'none',
                cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--raised)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
            >
              <div>
                <div style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>
                  {formatDate(entry.entryDate)}
                </div>
                {entry.reviewerComment && (
                  <div style={{ fontSize: 11, color: '#E0A93B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    "{entry.reviewerComment}"
                  </div>
                )}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-mut)' }}>
                {projectSummary(entry)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {taskSummary(entry)}
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: 'var(--txt-mut)' }}>
                {totalHours(entry).toFixed(1)}h
              </div>
              <div><StatusBadge status={entry.status} /></div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--txt-dim)' }}>
                {entry.submittedAt ? formatDateTime(entry.submittedAt) : '—'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ChevronRight size={14} style={{ color: 'var(--txt-dim)' }} aria-hidden />
              </div>
            </div>
          ))}

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderTop: '1px solid var(--line)',
            }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={pageSafe === 0}
                style={pagerBtnStyle(pageSafe === 0)}
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--txt-dim)', fontFamily: '"JetBrains Mono", monospace' }}>
                Page {pageSafe + 1} of {pageCount}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={pageSafe >= pageCount - 1}
                style={pagerBtnStyle(pageSafe >= pageCount - 1)}
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasFilter, onClear }: { hasFilter: boolean; onClear: () => void }) {
  return (
    <div style={{
      padding: '40px 24px', borderRadius: 8,
      background: 'var(--panel)', border: '1px solid var(--line)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)', marginBottom: 6 }}>
        {hasFilter ? 'No entries match this filter' : 'No EOD reports yet'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--txt-mut)', marginBottom: hasFilter ? 16 : 0 }}>
        {hasFilter
          ? 'Try a different status filter to see more entries.'
          : 'Submit your first end-of-day report to get started.'}
      </div>
      {hasFilter && (
        <button
          onClick={onClear}
          style={{
            padding: '7px 16px', borderRadius: 6,
            background: 'var(--raised2)', border: '1px solid var(--line2)',
            color: 'var(--txt)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Clear filter
        </button>
      )}
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
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 6,
    background: disabled ? 'transparent' : 'var(--raised2)',
    border: `1px solid ${disabled ? 'transparent' : 'var(--line2)'}`,
    color: disabled ? 'var(--line2)' : 'var(--txt-mut)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11, fontWeight: 600,
  };
}
