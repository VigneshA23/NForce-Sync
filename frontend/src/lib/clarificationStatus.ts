import type { StatusMeta } from '../components/StatusDropdown';
import type { ClarificationStatusValue } from '../api/eodClarification';

// Rose / amber / green — matches the EOD Inbox card design (accent bar + status pill), not
// Blockers' STATUS_META (pages/lead/Blockers.tsx), which uses risk/ok/info for its 3 states.
export const CLARIFICATION_STATUS_META: Record<ClarificationStatusValue, StatusMeta> = {
  NEEDS_RESPONSE: { label: 'Needs Response', color: 'var(--risk)' },
  ACKNOWLEDGED:   { label: 'Acknowledged',   color: 'var(--warn)' },
  RESOLVED:       { label: 'Resolved',       color: 'var(--ok)' },
};

export const CLARIFICATION_STATUS_OPTIONS: ClarificationStatusValue[] = [
  'NEEDS_RESPONSE', 'ACKNOWLEDGED', 'RESOLVED',
];
