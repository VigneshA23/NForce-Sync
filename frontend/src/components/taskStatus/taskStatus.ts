/**
 * Task / line Status — the same four values and wording on Submit EOD (per task) and the Daily Log (per line). No
 * React here: the options, the colours and the validation messages, shared so the two forms and the read-only
 * views cannot drift apart. Server counterparts: EodTask.TaskStatus, EodService.validateLoggedDay (Submit EOD) and
 * PlainLogValidation.validateStatus (Daily Log).
 */

/**
 * The empty first entry is the default, so status is a deliberate choice rather than a silent "Completed".
 * Kept as one list so the dropdown, the read-only view and the validators resolve labels from one place.
 */
export const TASK_STATUSES = [
  { value: '',            label: 'Status' },
  { value: 'COMPLETED',   label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'BLOCKED',     label: 'Blocked' },
  { value: 'NOT_STARTED', label: 'Not Started' },
];

export const TASK_STATUS_COLOR: Record<string, string> = {
  COMPLETED:   '#2FB67C',
  IN_PROGRESS: '#4C8DD6',
  BLOCKED:     '#E4373D',
  NOT_STARTED: '#9BA1AC',
};

/** Cap on the blocker reason, mirrored by @Size(max = 300) on the save requests. */
export const MAX_BLOCKER_REASON = 300;

/** "In Progress" for IN_PROGRESS, or null for an unset / unknown value. */
export function taskStatusLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return TASK_STATUSES.find(s => s.value === value)?.label ?? value;
}

/** What to call the row in a message: "Task 2" on Submit EOD, "Row 2" on the Daily Log. */
export type RowNoun = 'Task' | 'Row';

/** null when a status is chosen, else the message — "Task 1: status is required." / "Row 1: status is required." */
export function statusMissingMessage(noun: RowNoun, n: number, status: string | null | undefined): string | null {
  return status ? null : `${noun} ${n}: status is required.`;
}

/** null unless the status is Blocked and the reason is empty — same wording as Submit EOD, "Row n" on the Daily Log. */
export function blockerReasonMessage(
  noun: RowNoun, n: number, status: string | null | undefined, reason: string | null | undefined,
): string | null {
  return status === 'BLOCKED' && !(reason ?? '').trim()
    ? `${noun} ${n}: blocker reason is required when status is Blocked.`
    : null;
}
