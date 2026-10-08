import type { MemberEodStatus } from '../../api/teamLead';
import { formatDateRange, formatDateShort } from '../../lib/date';

// ── Team Overview summary maths + range-aware wording (pure, so it can be unit-tested) ──────────

export interface OverviewMember {
  status: MemberEodStatus;
  utilizationPct: number | null;
}

export interface OverviewCounts {
  total: number;
  submitted: number;
  pending: number;
  onLeave: number;
  missing: number;
  /** Team size minus people on leave — who was actually expected to submit. */
  expected: number;
  /** Submitted + pending approval, as a whole % of expected (0 when nobody was expected). */
  completionPct: number;
  /** Mean utilization over submitted/pending EODs only; null when there is nothing to average. */
  avgUtilization: number | null;
}

export function summarizeMembers(members: OverviewMember[]): OverviewCounts {
  let submitted = 0, pending = 0, onLeave = 0, missing = 0;
  let utilSum = 0, utilN = 0;
  for (const m of members) {
    if (m.status === 'SUBMITTED') submitted++;
    else if (m.status === 'PENDING_APPROVAL') pending++;
    else if (m.status === 'ON_LEAVE') onLeave++;
    else missing++;
    if ((m.status === 'SUBMITTED' || m.status === 'PENDING_APPROVAL') && m.utilizationPct !== null) {
      utilSum += m.utilizationPct;
      utilN++;
    }
  }
  const total = members.length;
  const expected = total - onLeave;
  return {
    total, submitted, pending, onLeave, missing, expected,
    completionPct: expected > 0 ? Math.round(((submitted + pending) / expected) * 100) : 0,
    avgUtilization: utilN > 0 ? utilSum / utilN : null,
  };
}

export type RangeKind = 'today' | 'day' | 'range';

export function rangeKind(range: { from: string; to: string }, today: string): RangeKind {
  if (range.from !== range.to) return 'range';
  return range.from === today ? 'today' : 'day';
}

export interface OverviewWording {
  subtitle: string;
  headline: string;
}

/** Headline + subtitle that never say "today" unless the range is exactly today. */
export function overviewWording(
  kind: RangeKind,
  range: { from: string; to: string },
  c: Pick<OverviewCounts, 'missing' | 'expected'>,
): OverviewWording {
  const subtitle =
    kind === 'today' ? 'Who has submitted today and who needs a nudge.'
    : kind === 'day' ? `Who had submitted on ${formatDateShort(range.from)} and who hadn't.`
    : `EOD submission status for ${formatDateRange(range)}.`;

  if (c.expected === 0) return { subtitle, headline: 'No EODs were expected' };

  if (kind === 'range') {
    const headline = c.missing === 0
      ? 'No missing EODs in this period'
      : `${c.missing} ${c.missing === 1 ? 'member has' : 'members have'} missing EODs in this period`;
    return { subtitle, headline };
  }
  const headline = c.missing === 0
    ? 'Everyone has submitted'
    : `${c.missing} of ${c.expected} EODs ${kind === 'today' ? 'still ' : ''}missing`;
  return { subtitle, headline };
}
