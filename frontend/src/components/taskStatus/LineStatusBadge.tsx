import { TASK_STATUS_COLOR, taskStatusLabel } from './taskStatus';

/**
 * A Daily Log line's Status as a small chip, plus its blocker reason when Blocked — for the read-only views
 * (the approver's card, the EOD report). Renders nothing for a line with no status (a line from before the Status
 * existed), so those views look exactly as they did.
 */
export function LineStatusBadge({ status, blockerReason }: { status?: string | null; blockerReason?: string | null }) {
  const label = taskStatusLabel(status);
  if (!label) return null;
  const color = TASK_STATUS_COLOR[status ?? ''] ?? 'var(--txt-dim)';
  return (
    <>
      <span style={{
        display: 'inline-block', padding: '1px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 600,
        color, background: `${color}18`, border: `1px solid ${color}40`, flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      {status === 'BLOCKED' && blockerReason && (
        <span style={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--risk)' }}>Blocker: {blockerReason}</span>
      )}
    </>
  );
}
