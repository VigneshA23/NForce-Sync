import { useQuery } from '@tanstack/react-query';

const NONE: never[] = [];

/**
 * The items of an org master that may be assigned to a user (active only, filtered by the
 * backend). Used by the Add/Edit User pickers for Location, Department, Designation and Shift.
 * Kept apart from the full list, which the table column, filters and CSV export need so stored
 * names keep resolving.
 *
 * Callers pass a key that sits under the master's existing key (['org', 'locations', 'active'] and
 * so on), so the invalidation Org Masters / Shift Timings already fire on a toggle refreshes this
 * too. staleTime 0 re-checks whenever a modal opens (`enabled` flips on for Edit; Add mounts
 * fresh) and on window focus — never while the user is typing or selecting. The previous list
 * stays rendered during a background refetch, so nothing flickers, and the empty fallback is a
 * stable reference so it can't feed a render loop.
 */
export function useAssignableMaster<T>(
  queryKey: readonly string[],
  fetchActive: () => Promise<T[]>,
  enabled: boolean,
): T[] {
  const q = useQuery({
    queryKey,
    queryFn: fetchActive,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return q.data ?? (NONE as T[]);
}
