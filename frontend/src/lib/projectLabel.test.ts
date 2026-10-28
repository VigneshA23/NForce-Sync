import { describe, expect, it } from 'vitest';
import { ledProjectOptions, projectLabel } from './projectLabel';

describe('projectLabel', () => {
  it('is "CODE — Name"', () => {
    expect(projectLabel({ code: 'SYNC', name: 'Nforce Sync' })).toBe('SYNC — Nforce Sync');
  });
  it('falls back to whichever part exists', () => {
    expect(projectLabel({ code: null, name: 'Nforce Sync' })).toBe('Nforce Sync');
    expect(projectLabel({ code: 'SYNC', name: ' ' })).toBe('SYNC');
    expect(projectLabel({})).toBe('');
  });
});

describe('ledProjectOptions', () => {
  it('lists only the given (led) projects, one label each, A to Z', () => {
    const led = [
      { code: 'SYNC', name: 'Nforce Sync' },
      { code: 'ONEHR', name: 'Nforce OneHR' },
    ];
    expect(ledProjectOptions(led)).toEqual(['ONEHR — Nforce OneHR', 'SYNC — Nforce Sync']);
  });
  it('has no duplicates', () => {
    const p = { code: 'SYNC', name: 'Nforce Sync' };
    expect(ledProjectOptions([p, { ...p }])).toEqual(['SYNC — Nforce Sync']);
  });
  it('is empty for a lead who leads nothing (or before the list has loaded)', () => {
    expect(ledProjectOptions([])).toEqual([]);
    expect(ledProjectOptions(undefined)).toEqual([]);
  });
});
