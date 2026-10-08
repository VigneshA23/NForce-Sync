import type { MemberEodStatus } from '../../api/teamLead';

// ── Team Overview member list: filter / search / sort (pure, so it can be unit-tested) ──────────

export interface ListMember {
  id: number;
  fullName: string;
  employeeCode: string;
  email: string | null;
  status: MemberEodStatus;
  utilizationPct: number | null;
  hasOpenBlocker: boolean;
}

export type StatusFilter = 'ALL' | MemberEodStatus | 'HAS_BLOCKER';
export type SortKey = 'attention' | 'name' | 'utilization';

const STATUS_PRIORITY: Record<MemberEodStatus, number> = {
  MISSING: 0, PENDING_APPROVAL: 1, SUBMITTED: 2, ON_LEAVE: 3,
};

/** Case-insensitive match on name or employee code; a blank query matches everyone. */
export function matchesSearch(m: Pick<ListMember, 'fullName' | 'employeeCode'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return m.fullName.toLowerCase().includes(q) || m.employeeCode.toLowerCase().includes(q);
}

export function matchesFilter(m: Pick<ListMember, 'status' | 'hasOpenBlocker'>, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'HAS_BLOCKER') return m.hasOpenBlocker;
  return m.status === filter;
}

/** Chip counts always describe the FULL list — never the search result. */
export function filterCounts(members: Pick<ListMember, 'status' | 'hasOpenBlocker'>[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    ALL: members.length, MISSING: 0, PENDING_APPROVAL: 0, SUBMITTED: 0, ON_LEAVE: 0, HAS_BLOCKER: 0,
  };
  for (const m of members) {
    counts[m.status]++;
    if (m.hasOpenBlocker) counts.HAS_BLOCKER++;
  }
  return counts;
}

const byName = (a: ListMember, b: ListMember) =>
  a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });

/** Returns a new array. Utilization sorts highest first, with members that have no value last. */
export function sortMembers(members: ListMember[], sort: SortKey): ListMember[] {
  const copy = [...members];
  if (sort === 'name') return copy.sort(byName);
  if (sort === 'utilization') {
    return copy.sort((a, b) => {
      if (a.utilizationPct === null && b.utilizationPct === null) return byName(a, b);
      if (a.utilizationPct === null) return 1;
      if (b.utilizationPct === null) return -1;
      return b.utilizationPct - a.utilizationPct || byName(a, b);
    });
  }
  return copy.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || byName(a, b));
}

export function visibleMembers(members: ListMember[], filter: StatusFilter, query: string, sort: SortKey): ListMember[] {
  return sortMembers(members.filter(m => matchesFilter(m, filter) && matchesSearch(m, query)), sort);
}

export type UtilTone = 'ok' | 'warn' | 'risk';

/** Green at 85 or above, amber 60–84, red under 60. */
export function utilTone(pct: number): UtilTone {
  if (pct >= 85) return 'ok';
  if (pct >= 60) return 'warn';
  return 'risk';
}

/** Missing and on-leave members have no utilization to show. */
export function showsUtilization(status: MemberEodStatus): boolean {
  return status === 'SUBMITTED' || status === 'PENDING_APPROVAL';
}
