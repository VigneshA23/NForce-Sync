import { Clock } from 'lucide-react';
import { timeAdjustmentLabel } from '../pages/approvals/shared';
import { statusPillStyle } from '../lib/uiStyles';

/**
 * The day's approved time adjustment, e.g. "2h early log-off".
 *
 * A day with an adjustment logs fewer hours than a full day, so on an hours-oriented report the
 * shortfall otherwise reads as unexplained under-logging. Wording comes from the shared
 * timeAdjustmentLabel so this never drifts from what the Approvals screens and the employee's own
 * history already say.
 *
 * Renders nothing when the day carries no adjustment, so call sites need no guard of their own.
 *
 * The adjustment belongs to the DAY while report rows are per TASK, so a multi-task day repeats it
 * on every row — call sites print it only on the day's first row, mirroring how the date itself is
 * printed once and left blank beneath.
 */
export function TimeAdjustmentBadge({ entry }: {
  entry: { timeAdjustmentType: string | null; timeAdjustmentMinutes: number | null };
}) {
  const label = timeAdjustmentLabel(entry);
  if (!label) return null;

  return (
    <span
      title={`Approved time adjustment: ${label}`}
      style={{
        ...statusPillStyle('var(--info)'),
        gap: 4, marginTop: 3, padding: '1px 7px 1px 6px', fontSize: 10, fontWeight: 700, lineHeight: 1.5,
      }}
    >
      <Clock size={9} style={{ flexShrink: 0 }} aria-hidden="true" />
      {label}
    </span>
  );
}
