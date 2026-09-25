import { requiredHoursForDay, HALF_LEAVE_LABELS } from '../lib/requiredHours';

/**
 * Names WHICH half of the day a half-day leave covers (First/Second), shown once per day next
 * to TimeAdjustmentBadge — same "belongs to the DAY, report rows are per TASK" convention.
 * Renders nothing on a day with no half-leave (plain Working Day, Weekend, Holiday, full Leave)
 * — just the label, not a "Req X.Xh" figure; the required-hours number and shortfall coloring
 * are still available on hover (title) for anyone who wants them.
 */
export function RequiredHoursBadge({ dayType, workingHoursPerDay, loggedHours }: {
  dayType: string | null;
  workingHoursPerDay: number;
  loggedHours: number;
}) {
  const halfLeaveLabel = dayType ? HALF_LEAVE_LABELS[dayType] : undefined;
  if (!halfLeaveLabel) return null;
  const required = requiredHoursForDay(dayType, workingHoursPerDay);
  const short = loggedHours < required - 0.001;

  return (
    <span
      title={`${halfLeaveLabel} — required ${required.toFixed(1)}h${short ? `, logged ${loggedHours.toFixed(1)}h` : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        marginTop: 3, padding: '1px 6px 1px 5px', borderRadius: 4,
        background: `color-mix(in srgb, var(${short ? '--warn' : '--txt-dim'}) 12%, transparent)`,
        color: short ? 'var(--warn)' : 'var(--txt-dim)', fontSize: 10, fontWeight: 700,
        whiteSpace: 'nowrap', lineHeight: 1.5,
      }}
    >
      {halfLeaveLabel}
    </span>
  );
}
