import { describe, expect, it } from 'vitest';
import {
  MAX_BLOCKER_REASON, TASK_STATUSES, TASK_STATUS_COLOR, blockerReasonMessage, statusMissingMessage, taskStatusLabel,
} from './taskStatus';

describe('shared task / line status', () => {
  it('offers the placeholder and exactly the four Submit EOD options, in order', () => {
    expect(TASK_STATUSES.map(s => s.value)).toEqual(['', 'COMPLETED', 'IN_PROGRESS', 'BLOCKED', 'NOT_STARTED']);
    expect(TASK_STATUSES.map(s => s.label)).toEqual(['Status', 'Completed', 'In Progress', 'Blocked', 'Not Started']);
    for (const v of ['COMPLETED', 'IN_PROGRESS', 'BLOCKED', 'NOT_STARTED']) expect(TASK_STATUS_COLOR[v]).toBeTruthy();
  });
  it('labels a value, and shows nothing for an unset one', () => {
    expect(taskStatusLabel('IN_PROGRESS')).toBe('In Progress');
    expect(taskStatusLabel('')).toBeNull();
    expect(taskStatusLabel(null)).toBeNull();
  });
  it('Submit EOD says "Task n:", the Daily Log says "Row n:" — same wording otherwise', () => {
    expect(statusMissingMessage('Task', 3, '')).toBe('Task 3: status is required.');
    expect(statusMissingMessage('Row', 3, undefined)).toBe('Row 3: status is required.');
    expect(statusMissingMessage('Row', 3, 'COMPLETED')).toBeNull();
    expect(blockerReasonMessage('Task', 1, 'BLOCKED', ' ')).toBe('Task 1: blocker reason is required when status is Blocked.');
    expect(blockerReasonMessage('Row', 1, 'BLOCKED', 'why')).toBeNull();
    expect(blockerReasonMessage('Row', 1, 'COMPLETED', '')).toBeNull();
  });
  it('the reason cap matches the server', () => {
    expect(MAX_BLOCKER_REASON).toBe(300);
  });
});
