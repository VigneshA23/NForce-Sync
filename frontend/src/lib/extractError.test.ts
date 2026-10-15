import { describe, expect, it } from 'vitest';
import { extractError } from './extractError';

const resp = (data: unknown) => ({ response: { data } });

describe('extractError', () => {
  it('shows the field-level reason instead of the generic "Validation failed"', () => {
    expect(extractError(resp({
      error: 'Validation failed',
      fields: { 'logLines[1].description': 'Description must be 3–4000 characters' },
    }))).toBe('Row 2: Description must be 3–4000 characters');
  });

  it('lists several rows in row order, and non-indexed fields as-is', () => {
    expect(extractError(resp({
      error: 'Validation failed',
      fields: { 'logLines[2].description': 'B', 'logLines[0].description': 'A', entryDate: 'C' },
    }))).toBe('C; Row 1: A; Row 3: B');
  });

  it('still returns error / message for responses without fields', () => {
    expect(extractError(resp({ error: 'Forbidden' }))).toBe('Forbidden');
    expect(extractError(resp({ message: 'm' }))).toBe('m');
    expect(extractError(resp({ error: 'Validation failed', fields: {} }))).toBe('Validation failed');
  });

  it('falls back when there is no response body', () => {
    expect(extractError(new Error('network'))).toBe('Something went wrong');
    expect(extractError(undefined)).toBe('Something went wrong');
  });
});
