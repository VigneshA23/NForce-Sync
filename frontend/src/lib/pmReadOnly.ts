/**
 * Project Managers (role 'pm') have a READ-ONLY view of Team Lead / employee conversations (EOD
 * clarifications and blockers): they can read, never post, reply, resolve, change a status, or raise a
 * clarification. This is the one place the frontend asks that question, mirroring the backend's
 * PmReadOnlyPolicy, which enforces the same rule with a 403 so hiding a control is never the only guard.
 */
export function isReadOnlyPm(role: string | undefined | null): boolean {
  return role === 'pm';
}
