import { describe, expect, it } from 'vitest';
import {
  findAllocationClash, hasStarted, overlappingAllocations, overlappingAllocationTotal, windowsOverlap,
} from './allocationHelpers';
import type { AllocationDto } from '../api/projects';

function alloc(over: Partial<AllocationDto> & Pick<AllocationDto, 'id'>): AllocationDto {
  return {
    employeeId: 1, employeeName: 'Asha Rao', employeeCode: 'E001',
    projectId: 100, projectCode: 'OLD', projectName: 'Old project',
    effectiveFrom: '2026-10-01', effectiveTo: null, allocationPct: 50,
    ...over,
  };
}

describe('windowsOverlap', () => {
  it('treats windows that merely touch as non-overlapping', () => {
    expect(windowsOverlap('2026-07-01', '2026-07-31', '2026-08-01', null)).toBe(false);
  });
  it('is inclusive at both ends', () => {
    expect(windowsOverlap('2026-07-01', '2026-07-31', '2026-07-31', '2026-08-15')).toBe(true);
  });
  it('treats a null end as open-ended', () => {
    expect(windowsOverlap('2026-07-01', null, '2030-01-01', '2030-02-01')).toBe(true);
  });
});

describe('overlappingAllocations / overlappingAllocationTotal', () => {
  const rows = [
    alloc({ id: 1, allocationPct: 50 }),
    alloc({ id: 2, projectId: 200, projectName: 'Other', allocationPct: 30 }),
    alloc({ id: 3, employeeId: 9, allocationPct: 90 }),                              // someone else
    alloc({ id: 4, effectiveFrom: '2025-01-01', effectiveTo: '2025-06-30', allocationPct: 40 }), // long over
  ];

  it('lists only this employee\'s overlapping rows and drops the excluded one', () => {
    const ids = overlappingAllocations(rows, 1, '2026-11-01', null, 1).map(a => a.id);
    expect(ids).toEqual([2]);
  });

  it('totals them, so the row being edited is not counted against itself', () => {
    expect(overlappingAllocationTotal(rows, 1, '2026-11-01', null)).toBe(80);
    expect(overlappingAllocationTotal(rows, 1, '2026-11-01', null, 1)).toBe(30);
  });
});

describe('findAllocationClash (duplicate guard)', () => {
  const rows = [alloc({ id: 1 }), alloc({ id: 2, projectId: 200 })];
  const base = { employeeId: 1, from: '2026-11-15', to: null as string | null };

  it('finds an overlapping row for the same employee and project', () => {
    expect(findAllocationClash(rows, { ...base, projectId: 200 })?.id).toBe(2);
  });
  it('ignores the row being edited', () => {
    expect(findAllocationClash(rows, { ...base, projectId: 200, excludeId: 2 })).toBeNull();
  });
  it('does not clash across different projects or employees', () => {
    expect(findAllocationClash(rows, { ...base, projectId: 300 })).toBeNull();
    expect(findAllocationClash(rows, { ...base, employeeId: 2, projectId: 200 })).toBeNull();
  });
  it('does not clash when the windows only touch', () => {
    const ended = [alloc({ id: 5, projectId: 200, effectiveFrom: '2026-10-01', effectiveTo: '2026-11-14' })];
    expect(findAllocationClash(ended, { ...base, projectId: 200 })).toBeNull();
  });
});

describe('hasStarted', () => {
  const today = '2026-11-10';

  it('is true once the allocation window has begun, today included', () => {
    expect(hasStarted({ effectiveFrom: '2026-10-01' }, today)).toBe(true);
    expect(hasStarted({ effectiveFrom: '2026-11-10' }, today)).toBe(true);
  });
  it('is false while the allocation is still in the future', () => {
    expect(hasStarted({ effectiveFrom: '2026-11-11' }, today)).toBe(false);
  });
});
