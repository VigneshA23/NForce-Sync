import { useEffect, useMemo, useState } from 'react';
import { Inbox, RefreshCw, X, Info, FileText } from 'lucide-react';
import { Card } from '../../components/KpiCard';
import { Avatar, avatarColor } from '../../components/BlockerThread';
import { ClarificationThreadView } from '../../components/ClarificationThread';
import { StatusBadge } from '../../components/StatusDropdown';
import { EodInboxStatusPills, EodInboxFilterToolbar, EodInboxTable } from '../../components/EodInboxCard';
import { EodDetailPanel } from '../../components/EodDetailPanel';
import { toggleFilterVal } from '../../components/FilterDropdown';
import {
  eodInboxMatchesSearch, eodInboxMatchesFilters, sortEodInboxRows,
  type EodInboxFilter, type EodInboxRowView, type EodInboxSort,
} from '../../lib/eodInboxFilter';
import { CLARIFICATION_STATUS_META } from '../../lib/clarificationStatus';
import { useEodInbox, useMarkClarificationRead, type EodInboxItemDto } from '../../api/eodClarification';
import { formatDate as fmtDate } from '../../lib/date';

function Skel({ h = 14, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />;
}

function DetailPanel({ item, onClose, onViewEod }: { item: EodInboxItemDto; onClose: () => void; onViewEod: () => void }) {
  return (
    <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 88px)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={item.employeeName} bg={avatarColor(item.employeeName)} size={34} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{item.employeeName}</div>
              <div style={{ fontSize: 12, color: 'var(--txt-mut)' }}>EOD entry for {fmtDate(item.entryDate)}</div>
            </div>
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
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--txt-mut)',
          background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '8px 10px',
          marginBottom: 10,
        }}>
          <Info size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: 'var(--info)' }} />
          Project Managers can view clarification conversations across teams. For updates, please contact the respective Team Leads.
        </div>
        <button
          onClick={onViewEod}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
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
            replyToLabel=""
            visibilityNote=""
            readOnly
          />
        </div>
      </div>
    </Card>
  );
}

const EMPTY_MESSAGE: Record<EodInboxFilter, string> = {
  ALL: 'Clarifications raised by Team Leads on your projects will appear here.',
  NEEDS_RESPONSE: 'No threads need a response right now.',
  ACKNOWLEDGED: 'No acknowledged threads right now.',
  RESOLVED: 'Resolved clarifications will appear here.',
};

export default function PmEodInbox() {
  const openQuery = useEodInbox('pm', true);
  const resolvedQuery = useEodInbox('pm', false);
  const markRead = useMarkClarificationRead('pm');
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

  useEffect(() => {
    setPage(1);
  }, [filter, search, employeeFilter, projectFilter, categoryFilter, sort]);

  const allItems = useMemo(() => {
    const merged = [...(openQuery.data ?? []), ...(resolvedQuery.data ?? [])];
    return merged.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [openQuery.data, resolvedQuery.data]);

  const rows: EodInboxRowView[] = useMemo(() => allItems.map(item => ({ item })), [allItems]);

  const counts: Record<EodInboxFilter, number> = useMemo(() => ({
    ALL: allItems.length,
    NEEDS_RESPONSE: allItems.filter(i => i.status === 'NEEDS_RESPONSE').length,
    ACKNOWLEDGED: allItems.filter(i => i.status === 'ACKNOWLEDGED').length,
    RESOLVED: allItems.filter(i => i.status === 'RESOLVED').length,
  }), [allItems]);

  // Options are derived from allItems, which is already cross-team-scoped server-side to
  // whatever this PM can see — same pattern pages/pm/ApprovalsPM.tsx uses for its own
  // Employee/Project/Category filters (no separate options endpoint needed).
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
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--txt)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            EOD Inbox
          </h1>
          <p style={{ fontSize: 13, color: 'var(--txt-mut)', margin: 0 }}>
            Read-only view of EOD clarification conversations across every team touching your projects.
          </p>
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
