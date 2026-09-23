import { CLARIFICATION_STATUS_META } from './clarificationStatus';
import type { EodInboxItemDto, ClarificationStatusValue } from '../api/eodClarification';

// Shared filter/search helpers for the EOD Inbox card list — split out of
// components/EodInboxCard.tsx so that file can export components only (fast-refresh requirement).

export type EodInboxFilter = 'ALL' | ClarificationStatusValue;

/** Thin wrapper around EodInboxItemDto — kept as its own type (rather than using EodInboxItemDto
 *  directly) so the table/search/filter/sort helpers share one shape, even though the table now
 *  reads every displayed field straight off `item` (employeeName, projectName, etc. are the same
 *  regardless of role, unlike the old card view which needed a role-specific display name). */
export interface EodInboxRowView {
  item: EodInboxItemDto;
}

// Employee-only — matches the CLARIFICATION column's own employee name (the entry owner, same
// field regardless of role), not the project or message text.
export function eodInboxMatchesSearch(row: EodInboxRowView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.item.employeeName.toLowerCase().includes(q);
}

export const EOD_INBOX_FILTER_ORDER: EodInboxFilter[] = ['ALL', 'NEEDS_RESPONSE', 'ACKNOWLEDGED', 'RESOLVED'];

export const EOD_INBOX_FILTER_LABEL: Record<EodInboxFilter, string> = {
  ALL: 'All',
  NEEDS_RESPONSE: 'Needs Response',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
};

export function eodInboxFilterColor(filter: EodInboxFilter): string {
  return filter === 'ALL' ? 'var(--brand)' : CLARIFICATION_STATUS_META[filter].color;
}

// ── Approvals-style Employee/Project/Category filter toolbar ───────────────────
// Reuses components/FilterDropdown.tsx's FilterDropdown (checkbox multi-select) and
// SortDropdown, same as pages/Approvals.tsx and pages/pm/Blockers.tsx — this module only holds
// the wiring shape (a filter group is just the props FilterDropdown already expects) and the
// row-matching predicate, not a new dropdown implementation.

export interface EodInboxFilterGroup {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  getLabel?: (value: string) => string;
}

export type EodInboxSort = 'latest' | 'oldest';

export const EOD_INBOX_SORT_OPTIONS: { value: EodInboxSort; label: string }[] = [
  { value: 'latest', label: 'Latest first' },
  { value: 'oldest', label: 'Oldest first' },
];

export function eodInboxMatchesFilters(row: EodInboxRowView, filters: {
  employee?: Set<string>;
  project: Set<string>;
  category: Set<string>;
}): boolean {
  const { item } = row;
  if (filters.employee && filters.employee.size > 0 && !filters.employee.has(item.employeeCode)) return false;
  if (filters.project.size > 0 && !item.projectNames.some(p => filters.project.has(p))) return false;
  if (filters.category.size > 0 && !item.categoryNames.some(c => filters.category.has(c))) return false;
  return true;
}

export function sortEodInboxRows(rows: EodInboxRowView[], sort: EodInboxSort): EodInboxRowView[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const diff = new Date(b.item.lastMessageAt).getTime() - new Date(a.item.lastMessageAt).getTime();
    return sort === 'latest' ? diff : -diff;
  });
  return sorted;
}
