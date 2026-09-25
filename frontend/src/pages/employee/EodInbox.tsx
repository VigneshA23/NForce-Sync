import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, RefreshCw, X, CalendarDays, User as UserIcon, FileText, Calendar, ChevronDown, Search } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { ClarificationThreadView } from '../../components/ClarificationThread';
import { StatusBadge } from '../../components/StatusDropdown';
import { EodInboxStatusPills, EodInboxTable } from '../../components/EodInboxCard';
import { EodDetailPanel } from '../../components/EodDetailPanel';
import {
  eodInboxMatchesSearch, sortEodInboxRows, EOD_INBOX_SORT_OPTIONS,
  type EodInboxFilter, type EodInboxRowView, type EodInboxSort,
} from '../../lib/eodInboxFilter';
import { CLARIFICATION_STATUS_META } from '../../lib/clarificationStatus';
import { useEodInbox, useMarkClarificationRead, type EodInboxItemDto } from '../../api/eodClarification';
import { formatDate as fmtDate, todayISO as localTodayISO, toLocalISODate } from '../../lib/date';
import type { DateRange } from '../../api/teamLead';

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function fmtDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

function DetailPanel({ item, onClose, onViewEod }: { item: EodInboxItemDto; onClose: () => void; onViewEod: () => void }) {
  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 88px)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>EOD entry for {fmtDate(item.entryDate)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={item.status} meta={CLARIFICATION_STATUS_META} />
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 2 }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="nf-r-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <CalendarDays size={14} aria-hidden="true" style={{ color: 'var(--txt-dim)', marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Opened</div>
              <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 600 }}>{fmtDateTimeParts(item.openedAt).date}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <UserIcon size={14} aria-hidden="true" style={{ color: 'var(--txt-dim)', marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)' }}>Requested by</div>
              <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 600 }}>{item.openedByName}</div>
            </div>
          </div>
        </div>
        <button
          onClick={onViewEod}
          style={{
            marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8,
            color: 'var(--txt)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <FileText size={13} aria-hidden="true" /> View EOD
        </button>
      </div>

      <div style={{ padding: '12px 20px 16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid var(--warn)', display: 'inline-block', flexShrink: 0 }}>
          Conversation
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ClarificationThreadView
            entryId={item.eodEntryId}
            scope="employee"
            replyToLabel="Reply to your Team Lead"
            visibilityNote="Replies are visible to your Team Lead"
            isLocked={!item.open}
          />
        </div>
      </div>
    </Card>
  );
}

type DateMode = 'all' | 'today' | 'yesterday' | 'range';

function fmtShortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

function DateFilterButton({ mode, range, onChange }: {
  mode: DateMode;
  range: DateRange;
  onChange: (mode: DateMode, range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const todayStr = localTodayISO();
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);

  const label = mode === 'all' ? 'All time'
    : mode === 'today' ? `Today, ${fmtShortDate(todayStr)}`
    : mode === 'yesterday' ? `Yesterday, ${fmtShortDate(range.from)}`
    : range.from === range.to ? fmtShortDate(range.from) : `${fmtShortDate(range.from)} – ${fmtShortDate(range.to)}`;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { setDraftFrom(range.from); setDraftTo(range.to); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          fontSize: 12.5, fontWeight: 600, color: 'var(--txt)', background: 'var(--raised)',
          border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <Calendar size={13} aria-hidden="true" />
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 300,
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 14,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => { onChange('all', { from: '', to: '' }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'all' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'all' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                }}
              >All time</button>
              <button
                onClick={() => { onChange('today', { from: todayStr, to: todayStr }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'today' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'today' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                }}
              >Today</button>
              <button
                onClick={() => { const y = yesterdayISO(); onChange('yesterday', { from: y, to: y }); setOpen(false); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: mode === 'yesterday' ? 'var(--info)' : 'var(--raised2)',
                  color: mode === 'yesterday' ? '#fff' : 'var(--txt)', border: '1px solid var(--line2)',
                }}
              >Yesterday</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Custom range
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>From</div>
                <div style={{ position: 'relative' }}>
                  <input type="date" value={draftFrom} max={todayStr}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    style={{ width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box', paddingRight: 44 }}
                  />
                  {draftFrom && (
                    <button type="button" aria-label="Clear from date" onClick={() => setDraftFrom('')}
                      style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', marginBottom: 6, textAlign: 'center' }}>To</div>
                <div style={{ position: 'relative' }}>
                  <input type="date" value={draftTo} max={todayStr}
                    onChange={(e) => setDraftTo(e.target.value)}
                    style={{ width: '100%', minWidth: 0, padding: '6px 8px', fontSize: 12, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', boxSizing: 'border-box', paddingRight: 44 }}
                  />
                  {draftTo && (
                    <button type="button" aria-label="Clear to date" onClick={() => setDraftTo('')}
                      style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {draftFrom !== '' && draftTo !== '' && draftFrom > draftTo && (
              <div style={{ fontSize: 11, color: 'var(--risk)', fontWeight: 600, marginBottom: 10 }} role="alert">
                From date cannot be later than To date.
              </div>
            )}
            <button
              onClick={() => {
                if (draftFrom !== '' && draftTo !== '' && draftFrom > draftTo) return;
                if (draftFrom === '' && draftTo === '') { onChange('all', { from: '', to: '' }); setOpen(false); return; }
                const from = draftFrom || draftTo;
                const to = draftTo || draftFrom;
                onChange('range', { from, to });
                setOpen(false);
              }}
              disabled={draftFrom !== '' && draftTo !== '' && draftFrom > draftTo}
              style={{
                width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                background: 'var(--brand)', border: '1px solid var(--brand)', color: '#fff',
                cursor: (draftFrom !== '' && draftTo !== '' && draftFrom > draftTo) ? 'not-allowed' : 'pointer',
                opacity: (draftFrom !== '' && draftTo !== '' && draftFrom > draftTo) ? 0.6 : 1,
              }}
            >Apply</button>
          </div>
        </>
      )}
    </div>
  );
}

const EMPTY_MESSAGE: Record<EodInboxFilter, string> = {
  ALL: "When your Team Lead requests clarification on a submitted EOD, it'll show up here.",
  NEEDS_RESPONSE: 'No threads need a response right now.',
  ACKNOWLEDGED: 'No acknowledged threads right now.',
  RESOLVED: 'Resolved clarifications will appear here.',
};

export default function EmployeeEodInbox() {
  const [searchParams] = useSearchParams();
  const highlightParam = searchParams.get('highlight');
  const highlightEntryId = highlightParam ? Number(highlightParam) : null;

  const openQuery = useEodInbox('employee', true);
  const resolvedQuery = useEodInbox('employee', false);
  const markRead = useMarkClarificationRead('employee');
  const isPending = openQuery.isPending || resolvedQuery.isPending;
  const isError = openQuery.isError || resolvedQuery.isError;
  const refetch = () => { openQuery.refetch(); resolvedQuery.refetch(); };

  // Keyed by clarificationId, not eodEntryId — an entry can have multiple clarification rounds
  // (e.g. a resolved one plus a fresh NEEDS_RESPONSE one), each its own table row sharing the same
  // eodEntryId. Selecting by entryId would highlight every row for that entry at once.
  const [selectedClarificationId, setSelectedClarificationId] = useState<number | null>(null);
  const [viewEodEntryId, setViewEodEntryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EodInboxFilter>('ALL');
  const [projectFilter, setProjectFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState<EodInboxSort>('latest');
  const [page, setPage] = useState(1);
  const appliedHighlightRef = useRef(false);
  const todayStr = localTodayISO();
  const [dateMode, setDateMode] = useState<DateMode>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  useEffect(() => {
    setPage(1);
  }, [filter, search, projectFilter, categoryFilter, sort]);

  const allItems = useMemo(() => {
    const merged = [...(openQuery.data ?? []), ...(resolvedQuery.data ?? [])];
    return merged.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [openQuery.data, resolvedQuery.data]);

  // A ?highlight= link only carries the eodEntryId, so resolve it to that entry's clarification
  // once the list has loaded, then apply just once (a later refetch shouldn't re-jump selection
  // if the user has since closed it or picked a different row).
  useEffect(() => {
    if (highlightEntryId == null || appliedHighlightRef.current) return;
    const match = allItems.find(i => i.eodEntryId === highlightEntryId);
    if (match) {
      setSelectedClarificationId(match.clarificationId);
      appliedHighlightRef.current = true;
    }
  }, [highlightEntryId, allItems]);

  const rows: EodInboxRowView[] = useMemo(() => allItems.map(item => ({ item })), [allItems]);

  const counts: Record<EodInboxFilter, number> = useMemo(() => ({
    ALL: allItems.length,
    NEEDS_RESPONSE: allItems.filter(i => i.status === 'NEEDS_RESPONSE').length,
    ACKNOWLEDGED: allItems.filter(i => i.status === 'ACKNOWLEDGED').length,
    RESOLVED: allItems.filter(i => i.status === 'RESOLVED').length,
  }), [allItems]);

  // No Employee filter here — every row is already the current employee's own entry.
  const allProjects = useMemo(() => [...new Set(allItems.flatMap(i => i.projectNames))].sort(), [allItems]);
  const allCategories = useMemo(() => [...new Set(allItems.flatMap(i => i.categoryNames))].sort(), [allItems]);

  const filteredRows = useMemo(() => sortEodInboxRows(
    rows
      .filter(r => filter === 'ALL' || r.item.status === filter)
      .filter(r => eodInboxMatchesSearch(r, search))
      .filter(r => !projectFilter || r.item.projectNames.includes(projectFilter))
      .filter(r => !categoryFilter || r.item.categoryNames.includes(categoryFilter))
      .filter(r => dateMode === 'all' || (r.item.entryDate >= dateRange.from && r.item.entryDate <= dateRange.to)),
    sort,
  ), [rows, filter, search, projectFilter, categoryFilter, sort, dateRange, dateMode]);

  const selected = useMemo(
    () => allItems.find(i => i.clarificationId === selectedClarificationId) ?? null,
    [allItems, selectedClarificationId],
  );

  function closeConversation() {
    setSelectedClarificationId(null);
    setViewEodEntryId(null);
  }

  if (isError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: 0 }}>EOD Inbox</h1>
        </div>
        <Card style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--risk)', fontSize: 13, marginBottom: 12 }}>Failed to load EOD Inbox.</div>
          <button onClick={refetch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 6, color: 'var(--txt)', fontSize: 13, cursor: 'pointer' }}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  const columns = selected && viewEodEntryId != null ? '1.3fr 1fr 1fr' : selected ? '1.7fr 1fr' : '1fr';

  return (
    <div className="nf-r-stack" style={{ display: 'grid', gridTemplateColumns: columns, gap: 16, alignItems: 'start' }}>
      {/* minWidth: 0 — grid items default to min-width: auto (their content's max-content size),
          which otherwise blows this column wider than its assigned track once the 3-panel layout
          allocates it less space, forcing the toolbar/table to wrap instead of shrinking. */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              EOD Inbox
            </h1>
            <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
              EOD entries where your Team Lead has requested clarification — reply here.
            </p>
          </div>
          <DateFilterButton
            mode={dateMode}
            range={dateRange}
            onChange={(m, r) => { setDateMode(m); setDateRange(r); }}
          />
        </div>

        <EodInboxStatusPills filter={filter} onFilterChange={setFilter} counts={counts} />
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          padding: '14px 16px', background: 'var(--panel)',
          border: '1px solid var(--line)', borderRadius: 10, marginBottom: 14,
        }}>
          <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 140 }}>
            <Search size={13} aria-hidden="true" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-dim)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: '100%', paddingLeft: 28, padding: '9px 12px 9px 28px',
                background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6,
                color: 'var(--txt)', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} aria-label="Filter by project" style={{ background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            <option value="">All Projects</option>
            {allProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Filter by category" style={{ background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            <option value="">All Categories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as EodInboxSort)} aria-label="Sort order" style={{ background: 'var(--shell)', border: '1px solid var(--line2)', borderRadius: 6, padding: '9px 12px', color: 'var(--txt)', fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginLeft: 'auto' }}>
            {EOD_INBOX_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {isPending ? (
          <Card style={{ padding: 20 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                <Skel h={14} w="40%" />
              </div>
            ))}
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card style={{ padding: '48px 20px', textAlign: 'center' }}>
            <Inbox size={28} style={{ color: 'var(--txt-dim)', marginBottom: 12 }} aria-hidden="true" />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>
              {search.trim() || projectFilter || categoryFilter ? 'No threads match your filters' : 'Nothing here yet'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>
              {search.trim() || projectFilter || categoryFilter ? 'Try a different name, project or keyword.' : EMPTY_MESSAGE[filter]}
            </div>
          </Card>
        ) : (
          <EodInboxTable
            rows={filteredRows}
            page={page}
            onPageChange={setPage}
            selectedClarificationId={selectedClarificationId}
            onSelect={clarificationId => {
              setViewEodEntryId(null);
              setSelectedClarificationId(id => (id === clarificationId ? null : clarificationId));
              const row = allItems.find(i => i.clarificationId === clarificationId);
              if (row?.unread) markRead.mutate(row.eodEntryId);
            }}
          />
        )}
      </div>

      {selected && (
        <div style={{ position: 'sticky', top: 72 }}>
          <DetailPanel item={selected} onClose={closeConversation} onViewEod={() => setViewEodEntryId(selected.eodEntryId)} />
        </div>
      )}

      {selected && viewEodEntryId != null && (
        <div style={{ position: 'sticky', top: 72 }}>
          <EodDetailPanel entryId={viewEodEntryId} onClose={() => setViewEodEntryId(null)} />
        </div>
      )}
    </div>
  );
}
