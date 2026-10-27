import { describe, expect, it } from 'vitest';
import { extractError, lockedLineIdOf } from './extractError';

const conflict = (data: object, status = 409) => ({ response: { status, data } });

describe('lockedLineIdOf — which line a "cannot be removed" 409 is about', () => {
  it('reads the line id from the 409 body', () => {
    const err = conflict({ error: 'Row 2 has a blocker conversation, so it cannot be removed. Change its status instead.', lineId: 42 });
    expect(lockedLineIdOf(err)).toBe(42);
    expect(extractError(err)).toBe('Row 2 has a blocker conversation, so it cannot be removed. Change its status instead.');
  });
  it('is null for every other error, so the generic handling still applies', () => {
    expect(lockedLineIdOf(conflict({ error: 'Entry in status SUBMITTED cannot be edited' }))).toBeNull();
    expect(lockedLineIdOf(conflict({ error: 'x', lineId: 42 }, 400))).toBeNull();
    expect(lockedLineIdOf(conflict({ error: 'x', lineId: '42' }))).toBeNull();
    expect(lockedLineIdOf(new Error('network'))).toBeNull();
    expect(lockedLineIdOf(undefined)).toBeNull();
  });
});
