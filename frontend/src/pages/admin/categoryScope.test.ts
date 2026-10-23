import { describe, expect, it } from 'vitest';
import { categoryScopeLabel, initialAddScope, productiveLocked } from './categoryScope';

describe('category scope helpers (Org Masters > Daily Log Categories)', () => {
  it('labels: Employee / Daily Log / Bench Log', () => {
    expect(categoryScopeLabel('EMPLOYEE')).toBe('Employee');
    expect(categoryScopeLabel('MANAGEMENT')).toBe('Daily Log');
    expect(categoryScopeLabel('BENCH')).toBe('Bench Log');
  });

  it('only Bench Log locks the Productive toggle', () => {
    expect(productiveLocked('BENCH')).toBe(true);
    expect(productiveLocked('MANAGEMENT')).toBe(false);
    expect(productiveLocked('EMPLOYEE')).toBe(false);
  });

  it('Add category from the Bench Log tab pre-selects Bench Log', () => {
    expect(initialAddScope('BENCH', 'MANAGEMENT')).toBe('BENCH');
  });

  it('elsewhere it keeps the admin\'s last choice, and a leftover Bench Log does not carry over', () => {
    expect(initialAddScope('ALL', 'MANAGEMENT')).toBe('MANAGEMENT');
    expect(initialAddScope('MANAGEMENT', 'EMPLOYEE')).toBe('EMPLOYEE');
    expect(initialAddScope('ALL', 'BENCH')).toBe('MANAGEMENT');
    expect(initialAddScope('EMPLOYEE', 'BENCH')).toBe('MANAGEMENT');
  });
});
