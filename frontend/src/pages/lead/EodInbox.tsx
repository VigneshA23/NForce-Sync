import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox, RefreshCw, X, CalendarDays, User as UserIcon, FileText } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { Avatar, avatarColor } from '../../components/BlockerThread';
import { ClarificationThreadView } from '../../components/ClarificationThread';
import { ConfirmModal } from '../../components/ConfirmModal';
import { StatusDropdown, StatusBadge } from '../../components/StatusDropdown';
import { EodInboxStatusPills, EodInboxFilterToolbar, EodInboxTable } from '../../components/EodInboxCard';
import { EodDetailPanel } from '../../components/EodDetailPanel';
import { toggleFilterVal } from '../../components/FilterDropdown';
import {
  eodInboxMatchesSearch, eodInboxMatchesFilters, sortEodInboxRows,
  type EodInboxFilter, type EodInboxRowView, type EodInboxSort,
} from '../../lib/eodInboxFilter';
import { CLARIFICATION_STATUS_META, CLARIFICATION_STATUS_OPTIONS } from '../../lib/clarificationStatus';
import {
  useEodInbox, useSetClarificationStatus, useMarkClarificationRead, type EodInboxItemDto, type ClarificationStatusValue,
} from '../../api/eodClarification';
import { formatDate as fmtDate } from '../../lib/date';
import { DateFilterButton, type DateFilterMode } from '../../components/BlockerDateFilterButton';
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
  const setStatus = useSetClarificationStatus();
  const [confirmResolve, setConfirmResolve] = useState(false);

  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 88px)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={item.employeeName} bg={avatarColor(item.employeeName)} size={34} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{item.employeeName}</div>
                <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{item.employeeCode}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>EOD entry for {fmtDate(item.entryDate)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!item.open ? (
              <StatusBadge status={item.status} meta={CLARIFICATION_STATUS_META} />
            ) : (
              <StatusDropdown
                status={item.status}
                options={CLARIFICATION_STATUS_OPTIONS}
                meta={CLARIFICATION_STATUS_META}
                disabled={setStatus.isPending}
                onChange={(status: ClarificationStatusValue) => {
                  if (status === 'RESOLVED') setConfirmResolve(true);
                  else setStatus.mutate({ entryId: item.eodEntryId, status });
                }}
              />
            )}
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
            scope="lead"
            replyToLabel={`Reply to ${item.employeeName}`}
            visibilityNote={`Replies are visible to ${item.employeeName}`}
            isLocked={!item.open}
          />
        </div>
      </div>

      <ConfirmModal
        open={confirmResolve}
        onClose={() => setConfirmResolve(false)}
        onConfirm={() => {
          setStatus.mutate({ entryId: item.eodEntryId, status: 'RESOLVED' }, {
            onSuccess: () => setConfirmResolve(false),
          });
        }}
        title="Resolve this clarification?"
        message={`This will move ${item.employeeName}'s EOD entry back to Approvals and notify them. This cannot be undone.`}
        confirmLabel="Yes, Resolve"
        isPending={setStatus.isPending}
      />
    </Card>
  );
}

const EMPTY_MESSAGE: Record<EodInboxFilter, string> = {
  ALL: "Request a clarification from an entry in Approvals to start a conversation here.",
  NEEDS_RESPONSE: 'No threads need a response right now.',
  ACKNOWLEDGED: 'No acknowledged threads right now.',
  RESOLVED: 'Resolved clarifications will appear here.',
};

export default function EodInbox() {
  const [searchParams] = useSearchParams();
  const highlightParam = searchParams.get('highlight');
  const highlightEntryId = highlightParam ? Number(highlightParam) : null;

  const openQuery = useEodInbox('lead', true);
  const resolvedQuery = useEodInbox('lead', false);
  const markRead = useMarkClarificationRead('lead');
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
  const [employeeFilter, setEmployeeFilter] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<EodInboxSort>('latest');
  const [page, setPage] = useState(1);
  const appliedHighlightRef = useRef(false);
  // Same Today/Yesterday/Custom-range/All-time picker as Blockers — defaults to All time (no
  // filter) rather than Blockers' own Today default, since a clarification opened days or weeks
  // ago is still just as actionable and an inbox that looks emptied out on first load would read
  // as a bug, not a feature.
  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  useEffect(() => {
    setPage(1);
  }, [filter, search, employeeFilter, projectFilter, categoryFilter, sort, dateMode, dateRange]);

  const allItems = useMemo(() => {
    const merged = [...(openQuery.data ?? []), ...(resolvedQuery.data ?? [])];
    // Filters on the EOD entry's own date, same field the Employee EOD Inbox's equivalent
    // filter already used — entryDate is a plain yyyy-MM-dd, so no timezone-sensitive
    // conversion is needed the way openedAt (a full instant) would require.
    const dateFiltered = dateMode === 'all' ? merged
      : merged.filter(i => i.entryDate >= dateRange.from && i.entryDate <= dateRange.to);
    return dateFiltered.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [openQuery.data, resolvedQuery.data, dateMode, dateRange]);

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

  // Employee filter keys off employeeCode (stable) but displays employeeName — same
  // key/label split Approvals uses for its Employee filter.
  const employeeNameByCode = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const item of allItems) byCode.set(item.employeeCode, item.employeeName);
    return byCode;
  }, [allItems]);
  const allEmployeeCodes = useMemo(
    () => [...employeeNameByCode.keys()].sort((a, b) => employeeNameByCode.get(a)!.localeCompare(employeeNameByCode.get(b)!)),
    [employeeNameByCode],
  );
  const allProjects = useMemo(() => [...new Set(allItems.flatMap(i => i.projectNames))].sort(), [allItems]);
  const allCategories = useMemo(() => [...new Set(allItems.flatMap(i => i.categoryNames))].sort(), [allItems]);

  const filteredRows = useMemo(() => sortEodInboxRows(
    rows
      .filter(r => filter === 'ALL' || r.item.status === filter)
      .filter(r => eodInboxMatchesSearch(r, search))
      .filter(r => eodInboxMatchesFilters(r, { employee: employeeFilter, project: projectFilter, category: categoryFilter })),
    sort,
  ), [rows, filter, search, employeeFilter, projectFilter, categoryFilter, sort]);

  const selected = useMemo(
    () => allItems.find(i => i.clarificationId === selectedClarificationId) ?? null,
    [allItems, selectedClarificationId],
  );

  // Closing the conversation takes its EOD detail panel with it — it can't exist without a
  // conversation to hang off of.
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
              EOD entries with a clarification you've requested — they stay out of Approvals until resolved.
            </p>
          </div>
          <DateFilterButton
            mode={dateMode} range={dateRange} showAllOption enforceNotFuture={false}
            onChange={(m, r) => { setDateMode(m); setDateRange(r); }}
          />
        </div>

        <EodInboxStatusPills filter={filter} onFilterChange={setFilter} counts={counts} />
        <EodInboxFilterToolbar
          search={search}
          onSearchChange={setSearch}
          employee={{
            options: allEmployeeCodes,
            selected: employeeFilter,
            onToggle: v => toggleFilterVal(employeeFilter, setEmployeeFilter, v),
            onClear: () => setEmployeeFilter(new Set()),
            getLabel: code => employeeNameByCode.get(code) ?? code,
          }}
          project={{
            options: allProjects,
            selected: projectFilter,
            onToggle: v => toggleFilterVal(projectFilter, setProjectFilter, v),
            onClear: () => setProjectFilter(new Set()),
          }}
          category={{
            options: allCategories,
            selected: categoryFilter,
            onToggle: v => toggleFilterVal(categoryFilter, setCategoryFilter, v),
            onClear: () => setCategoryFilter(new Set()),
          }}
          sort={sort}
          onSortChange={setSort}
        />

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
              {search.trim() || employeeFilter.size || projectFilter.size || categoryFilter.size ? 'No threads match your filters' : 'Nothing here yet'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--txt-dim)' }}>
              {search.trim() || employeeFilter.size || projectFilter.size || categoryFilter.size ? 'Try a different name, project or keyword.' : EMPTY_MESSAGE[filter]}
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
