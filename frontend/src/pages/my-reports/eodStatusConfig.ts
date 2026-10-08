import type { MemberEodStatus } from '../../api/teamLead';

// Shared by the Team EOD Status list and the per-employee detail page so a status looks
// identical in both places. (Components live in eodStatusUi.tsx — kept separate so React
// fast-refresh stays happy.)

export const STATUS_CFG: Record<MemberEodStatus, { color: string; label: string }> = {
  SUBMITTED:        { color: 'var(--ok)',   label: 'Approved' },
  PENDING_APPROVAL: { color: 'var(--warn)', label: 'Pending' },
  MISSING:          { color: 'var(--risk)', label: 'Missing' },
  ON_LEAVE:         { color: 'var(--info)', label: 'On Leave' },
};

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}
