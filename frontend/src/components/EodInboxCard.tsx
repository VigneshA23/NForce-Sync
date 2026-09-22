import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Search, X as XIcon } from 'lucide-react';
import { Card } from './KpiCard';
import { Avatar, avatarColor, TL_AVATAR_BG } from './BlockerThread';
import { StatusBadge } from './StatusDropdown';
import { FilterDropdown, SortDropdown } from './FilterDropdown';
import { formatRelative } from '../pages/approvals/shared';
import { CLARIFICATION_STATUS_META } from '../lib/clarificationStatus';
import {
  EOD_INBOX_FILTER_ORDER, EOD_INBOX_FILTER_LABEL, EOD_INBOX_SORT_OPTIONS, eodInboxFilterColor,
  type EodInboxFilter, type EodInboxFilterGroup, type EodInboxRowView, type EodInboxSort,
} from '../lib/eodInboxFilter';
import { formatDate as fmtDate } from '../lib/date';

// Shared card-list building blocks for the EOD Inbox redesign — used identically by all three
// role variants (pages/lead/EodInbox.tsx, pages/employee/EodInbox.tsx, pages/pm/EodInbox.tsx),
// which otherwise stay independent pages (own DetailPanel, own data fetching) per this app's
// per-role-page convention (see Blockers). Only the presentational list/search/filter layer is
// identical enough across the three to share. Filter/search helpers live in
// lib/eodInboxFilter.ts, not here, so this file can stay component-only exports.

export function EodInboxStatusPills({ filter, onFilterChange, counts }: {
  filter: EodInboxFilter;
  onFilterChange: (filter: EodInboxFilter) => void;
  counts: Record<EodInboxFilter, number>;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {EOD_INBOX_FILTER_ORDER.map(f => {
        const active = filter === f;
        const color = eodInboxFilterColor(f);
        return (
          <button
            key={f}
            type="button"
            onClick={() => onFilterChange(f)}
            aria-pressed={active}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: active ? color : 'transparent',
              color: active ? '#fff' : color,
              border: `1px solid ${active ? color : `color-mix(in srgb, ${color} 40%, transparent)`}`,
              whiteSpace: 'nowrap',
            }}
          >
            {EOD_INBOX_FILTER_LABEL[f]} ({counts[f]})
          </button>
        );
      })}
    </div>
  );
}

// Same bordered toolbar container, search box and FilterDropdown/SortDropdown wiring as
// pages/Approvals.tsx's toolbar (search+filters below the Pending/Approved/Rejected pills) —
// straight reuse of FilterDropdown/SortDropdown, not a new dropdown implementation.
export function EodInboxFilterToolbar({
  search, onSearchChange, employee, project, category, sort, onSortChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  /** Omitted entirely by the Employee EOD Inbox — every row is already their own. */
  employee?: EodInboxFilterGroup;
  project: EodInboxFilterGroup;
  category: EodInboxFilterGroup;
  sort: EodInboxSort;
  onSortChange: (sort: EodInboxSort) => void;
}) {
  const hasActiveFilters = (employee?.selected.size ?? 0) > 0 || project.selected.size > 0 || category.selected.size > 0;
  const clearAllFilters = () => { employee?.onClear(); project.onClear(); category.onClear(); };

  return (
    // eod-inbox-toolbar establishes a container-query context (see index.css) so the row reacts
    // to its own box getting squeezed by the 3-panel (list | conversation | EOD detail) layout —
    // that can happen at any viewport width, which a @media rule (like nf-r-toolbar's own mobile
    // wrap) can't see since it only watches the viewport, not this element's box. flexWrap stays
    // 'nowrap' here by design: this toolbar must never wrap to a second line, only shrink/collapse.
    <div
      className="eod-inbox-toolbar nf-r-toolbar"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', minWidth: 0,
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12,
        padding: '10px 12px', marginBottom: 14,
      }}
    >
      <div style={{ flex: '0 1 220px', minWidth: 90, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--raised2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '7px 10px' }}>
        <Search size={13} style={{ color: 'var(--txt-dim)', flexShrink: 0 }} aria-hidden="true" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by employee..."
          title="Search by employee"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12.5, width: '100%', minWidth: 0 }}
        />
        {search && (
          <button onClick={() => onSearchChange('')} aria-label="Clear search" style={{ background: 'none', border: 'none', color: 'var(--txt-dim)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <XIcon size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* flex: 1 1 auto + justifyContent: center — this middle section absorbs the remaining
          space between the search box and Sort, then centers the filter group within it, so the
          group sits with an equal gap on both sides rather than hugging the search box. */}
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
        {employee && (
          <FilterDropdown
            label="Employee"
            options={employee.options}
            selected={employee.selected}
            onToggle={employee.onToggle}
            onClear={employee.onClear}
            getLabel={employee.getLabel}
          />
        )}
        <FilterDropdown label="Project" options={project.options} selected={project.selected} onToggle={project.onToggle} onClear={project.onClear} />
        <FilterDropdown label="Category" options={category.options} selected={category.selected} onToggle={category.onToggle} onClear={category.onClear} />
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            title="Clear all filters"
            style={{ background: 'none', border: '1px solid var(--line2)', borderRadius: 8, color: 'var(--brand-bright)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '7px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <span className="nf-fd-label">Clear all filters</span>
            <XIcon className="nf-fd-icon-only" size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <SortDropdown label="Sort" options={EOD_INBOX_SORT_OPTIONS} value={sort} onChange={onSortChange} />
      </div>
    </div>
  );
}

// ── table (replaces the earlier card-list view) — matches Blockers' table exactly: same
// CSS-Grid column layout, nf-r-scroll wrapper, row styling and "Showing X to Y of Z results"
// pagination footer (see pages/lead/Blockers.tsx's BlockerRow + table markup). Blockers' table
// itself isn't a reusable component (independently hand-rolled per role page, blocker-field-
// specific), so this is a fresh EOD-Inbox-field version of the same pattern, shared once here
// across all three EOD Inbox pages instead of forked per role like Blockers is.

export const EOD_INBOX_PAGE_SIZE = 8;

const EOD_TABLE_COLUMNS = '32px 2.2fr 1fr 1.1fr 1.1fr 0.8fr 1.3fr 1fr';
const EOD_TABLE_MIN_WIDTH = 1080;

// One line, no wrap — "21 Sep, 7:38 PM" — instead of the two-line "21 Sept 2026" / "7:38 PM"
// this used to render via <br/>. The full value is still available via the title attribute.
function fmtOpenedAtCompact(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} ${month}, ${time}`;
}

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function EodInboxTableRow({ row, index, selected, onClick }: {
  row: EodInboxRowView;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const { item } = row;
  const accentColor = CLARIFICATION_STATUS_META[item.status].color;
  const openedAtFull = new Date(item.openedAt).toLocaleString();
  // Unread rows render bold (name + preview line) until the row is opened — see
  // EodClarificationService#markRead on the backend and useMarkClarificationRead on the frontend.
  // Secondary metadata (date, requested-by, status) stays regular weight either way.
  const unread = item.unread;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: 'var(--eod-table-cols)', gap: 12,
        padding: '14px 20px', cursor: 'pointer', alignItems: 'center',
        borderBottom: '1px solid var(--line)',
        background: selected ? 'color-mix(in srgb, var(--warn) 8%, transparent)' : 'transparent',
        borderLeft: selected ? `3px solid ${accentColor}` : '3px solid transparent',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--txt-dim)', fontWeight: 600 }}>{index}</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <Avatar name={item.employeeName} bg={avatarColor(item.employeeName)} size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: unread ? 800 : 400, color: unread ? 'var(--txt)' : 'var(--txt-mut)', marginBottom: 2, ...ellipsis }} title={item.employeeName}>
            {item.employeeName}
          </div>
          {item.lastMessage && (
            <div style={{ fontSize: 12, fontWeight: unread ? 700 : 400, color: unread ? 'var(--txt)' : 'var(--txt-dim)', lineHeight: 1.4, marginBottom: 2, ...ellipsis }} title={item.lastMessage}>
              {item.lastMessage}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--txt-dim)', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, ...ellipsis }}>
            <CalendarDays size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> {fmtDate(item.entryDate)}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--txt-mut)', minWidth: 0, ...ellipsis }} title={item.projectName ?? undefined}>
        {item.projectName ?? '—'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Avatar name={item.openedByName} bg={TL_AVATAR_BG} size={26} />
        <span style={{ fontSize: 12.5, color: 'var(--txt)', minWidth: 0, ...ellipsis }} title={item.openedByName}>
          {item.openedByName}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--txt-mut)', fontFamily: '"JetBrains Mono", monospace', minWidth: 0, ...ellipsis }} title={openedAtFull}>
        {fmtOpenedAtCompact(item.openedAt)}
      </div>

      <div className="eod-col-replies" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--txt-mut)' }}>
        <MessageCircle size={13} aria-hidden="true" /> {item.replyCount}
      </div>

      <div className="eod-col-lastreply" style={{ minWidth: 0 }}>
        {item.lastMessageSenderName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Avatar
              name={item.lastMessageSenderName}
              bg={item.lastMessageSenderRole === 'EMPLOYEE' ? avatarColor(item.lastMessageSenderName) : TL_AVATAR_BG}
              size={24}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: 500, ...ellipsis }} title={item.lastMessageSenderName}>
                {item.lastMessageSenderName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt-dim)', ...ellipsis }}>{formatRelative(item.lastMessageAt)}</div>
            </div>
          </div>
        ) : (
          <span style={{ color: 'var(--txt-dim)', fontSize: 13 }}>—</span>
        )}
      </div>

      <div><StatusBadge status={item.status} meta={CLARIFICATION_STATUS_META} /></div>
    </div>
  );
}

export function EodInboxTable({
  rows, page, onPageChange, selectedClarificationId, onSelect,
}: {
  rows: EodInboxRowView[];
  page: number;
  onPageChange: (page: number) => void;
  /** Keyed by clarificationId, not eodEntryId — an entry can have multiple clarification rounds
   *  (rows) sharing the same eodEntryId, and highlighting must pick out only the one row actually
   *  clicked, not every row for that entry. */
  selectedClarificationId: number | null;
  onSelect: (clarificationId: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / EOD_INBOX_PAGE_SIZE));
  const pageItems = rows.slice((page - 1) * EOD_INBOX_PAGE_SIZE, page * EOD_INBOX_PAGE_SIZE);

  return (
    // eod-inbox-table establishes a container-query context (see index.css): once the 3-panel
    // layout squeezes this table's own box below the width Replies+Last Reply need, those two
    // columns hide (both header and rows, kept in sync via --eod-table-cols) rather than letting
    // their content wrap and blow out row height. nf-r-scroll/-inner is unaffected — it still
    // handles the true "narrower than min-width" case (viewport < 1024px) via horizontal scroll.
    <Card style={{ padding: 0, overflow: 'hidden' }} className="eod-inbox-table">
      <div className="nf-r-scroll">
        <div className="nf-r-scroll-inner" style={{ '--nf-r-min': EOD_TABLE_MIN_WIDTH + 'px', '--eod-table-cols': EOD_TABLE_COLUMNS } as React.CSSProperties}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'var(--eod-table-cols)', gap: 12,
            padding: '10px 20px', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--txt-dim)',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>S.No</span>
            <span>Clarification</span>
            <span>Project</span>
            <span>Requested By</span>
            <span>Requested On</span>
            <span className="eod-col-replies">Replies</span>
            <span className="eod-col-lastreply">Last Reply</span>
            <span>Status</span>
          </div>

          {pageItems.map((row, i) => (
            <EodInboxTableRow
              key={row.item.clarificationId}
              row={row}
              index={(page - 1) * EOD_INBOX_PAGE_SIZE + i + 1}
              selected={row.item.clarificationId === selectedClarificationId}
              onClick={() => onSelect(row.item.clarificationId)}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
        <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>
          {rows.length === 0
            ? 'Showing 0 of 0 results'
            : `Showing ${(page - 1) * EOD_INBOX_PAGE_SIZE + 1} to ${Math.min(page * EOD_INBOX_PAGE_SIZE, rows.length)} of ${rows.length} results`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{ display: 'flex', padding: 5, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <span style={{
            minWidth: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700,
          }}>
            {page}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={{ display: 'flex', padding: 5, borderRadius: 6, background: 'var(--raised2)', border: '1px solid var(--line2)', color: 'var(--txt)', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  );
}
