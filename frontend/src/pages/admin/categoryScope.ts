import type { TaskCategoryScope } from '../../api/admin';

/** What the admin screens call each task-category scope. */
export function categoryScopeLabel(scope: TaskCategoryScope): string {
  switch (scope) {
    case 'MANAGEMENT': return 'Daily Log';
    case 'BENCH':      return 'Bench Log';
    default:           return 'Employee';
  }
}

/** Bench Log categories are always non-productive (the server and a DB check enforce it) — the toggle is locked. */
export function productiveLocked(scope: TaskCategoryScope): boolean {
  return scope === 'BENCH';
}

/**
 * The scope "Add category" opens with. From the Bench Log tab it is Bench Log; anywhere else it keeps what the
 * admin last picked (the previous default, Daily Log) — except a leftover Bench Log, which must not carry over
 * from an earlier open of the modal on the Bench Log tab.
 */
export function initialAddScope(activeTab: 'ALL' | TaskCategoryScope, lastScope: TaskCategoryScope): TaskCategoryScope {
  if (activeTab === 'BENCH') return 'BENCH';
  return lastScope === 'BENCH' ? 'MANAGEMENT' : lastScope;
}
