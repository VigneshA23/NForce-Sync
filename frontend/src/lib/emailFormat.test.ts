import { describe, expect, it } from 'vitest';
import { isValidEmail } from './emailFormat';

describe('isValidEmail', () => {
  it('accepts ordinary company addresses, trimming surrounding space', () => {
    expect(isValidEmail('asha@nforceone.com')).toBe(true);
    expect(isValidEmail('  first.last+tag@nforce.one ')).toBe(true);
  });

  it('rejects empty, spaced, and incomplete addresses', () => {
    for (const bad of ['', '   ', 'plain', 'a@b', '@x.com', 'a@.com', 'a b@c.com', 'a@b@c.com']) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it('rejects addresses longer than the backend allows', () => {
    expect(isValidEmail('a'.repeat(200) + '@x.com')).toBe(false);
  });
});
