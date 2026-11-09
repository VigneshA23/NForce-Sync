import type { AllocationDto } from '../api/projects';

/**
 * Pure helpers behind the allocation modals' advisory checks. Each mirrors a rule that
 * AllocationService enforces server-side; the client copy only saves a round trip.
 */

/** Blank or null end date = open-ended; mirrors Allocation.OPEN_ENDED and V54's 9999-12-31. */
export const OPEN_ENDED_ISO = '9999-12-31';

/**
 * Whether two allocation windows overlap. Both are inclusive at each end, so windows that merely
 * touch — one ends 31-07, the next starts 01-08 — do not overlap and a re-assignment is allowed.
 *
 * ISO `yyyy-MM-dd` sorts lexicographically, so these are plain string compares: no Date parsing and
 * so no timezone shift.
 */
export function windowsOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  return aFrom <= (bTo || OPEN_ENDED_ISO) && (aTo || OPEN_ENDED_ISO) >= bFrom;
}

/**
 * Every one of this employee's allocations (any project) whose window overlaps [from, to].
 * `excludeId` drops the row being edited so it isn't counted against itself.
 */
export function overlappingAllocations(
  allocations: AllocationDto[], employeeId: number, from: string, to: string | null, excludeId?: number,
): AllocationDto[] {
  return allocations.filter(a => a.employeeId === employeeId
    && a.id !== excludeId
    && windowsOverlap(a.effectiveFrom, a.effectiveTo, from, to));
}

/** Sum of allocation % across {@link overlappingAllocations} — the "current allocation" being stacked on. */
export function overlappingAllocationTotal(
  allocations: AllocationDto[], employeeId: number, from: string, to: string | null, excludeId?: number,
): number {
  return overlappingAllocations(allocations, employeeId, from, to, excludeId)
    .reduce((sum, a) => sum + a.allocationPct, 0);
}

/**
 * The duplicate-allocation guard: another row for the same employee AND project whose window
 * overlaps [from, to]. Excludes `excludeId`, so re-saving a row's own dates is never a clash.
 */
export function findAllocationClash(
  allocations: AllocationDto[],
  q: { employeeId: number; projectId: number; from: string; to: string | null; excludeId?: number },
): AllocationDto | null {
  return allocations.find(a => a.id !== q.excludeId
    && a.employeeId === q.employeeId
    && a.projectId === q.projectId
    && windowsOverlap(a.effectiveFrom, a.effectiveTo, q.from, q.to)) ?? null;
}

/**
 * Whether the allocation's window has already begun (effectiveFrom on or before `today`, both ISO
 * `yyyy-MM-dd`). Changing the project of such an allocation moves its past dates too, which the
 * edit form warns about.
 */
export function hasStarted(allocation: Pick<AllocationDto, 'effectiveFrom'>, today: string): boolean {
  return allocation.effectiveFrom <= today;
}
