// Option logic shared by every org-master dropdown on Add/Edit User (Location, Department,
// Designation, Shift): the pickers offer active items only, but never blank out a user's
// existing value just because it has since been deactivated.

export const INACTIVE_SUFFIX = ' (inactive)';

interface MasterItem { id: number; active: boolean }

/** Label for an option: inactive ones are marked so they can't be mistaken for live choices. */
export function withInactiveSuffix(label: string, active: boolean): string {
  return active ? label : `${label}${INACTIVE_SUFFIX}`;
}

/**
 * Options for a picker: every active item, plus the record's current item when it has since been
 * deactivated. Add passes `currentId = null` and gets the active list only. Order follows `all`
 * (the backend sorts each master its own way — by name, title or start time), so the current item
 * lands where it would normally sit rather than at the end.
 */
export function pickerItems<T extends MasterItem>(
  active: T[],
  all: T[],
  currentId: number | null | undefined,
): T[] {
  if (currentId == null || active.some(i => i.id === currentId)) return active;
  const current = all.find(i => i.id === currentId);
  if (!current) return active;
  const activeIds = new Set(active.map(i => i.id));
  return all.filter(i => activeIds.has(i.id) || i.id === currentId);
}

/** Names of deactivated items, used to stop the "type a new one" path from re-creating one. */
export function inactiveNames<T extends MasterItem>(all: T[], nameOf: (item: T) => string): string[] {
  return all.filter(i => !i.active).map(nameOf);
}
