import { describe, expect, it } from 'vitest';
import {
  descriptionError, draftBlockReason, draftErrorMessage, firstInvalidLine, lineProblems, type LineFields,
} from './dailyLogValidation';

const line = (over: Partial<LineFields> = {}): LineFields =>
  ({ key: 1, categoryId: 5, hours: 1, description: 'Standup', ...over });

describe('descriptionError — one rule for every role on the Daily Log form', () => {
  it('empty and whitespace-only are required errors', () => {
    expect(descriptionError('')).toBe('Description is required (min 3 characters)');
    expect(descriptionError('   \t ')).toBe('Description is required (min 3 characters)');
  });
  it('1–2 characters (after trim) keep the existing minimum message', () => {
    expect(descriptionError('ab')).toBe('Minimum 3 characters required');
    expect(descriptionError('  ab  ')).toBe('Minimum 3 characters required');
  });
  it('3 characters (after trim) is accepted', () => {
    expect(descriptionError('abc')).toBeNull();
    expect(descriptionError('  abc ')).toBeNull();
  });
  it('over 4000 is rejected, exactly 4000 is fine', () => {
    expect(descriptionError('x'.repeat(4000))).toBeNull();
    expect(descriptionError('x'.repeat(4001))).not.toBeNull();
  });
});

describe('firstInvalidLine — what gets scrolled to and focused on a failed submit', () => {
  it('valid lines → null', () => {
    expect(firstInvalidLine([line(), line({ key: 2 })])).toBeNull();
  });
  it('picks the first invalid ROW, and the first invalid control inside it', () => {
    const lines = [line({ key: 1 }), line({ key: 2, description: '' }), line({ key: 3, categoryId: null })];
    expect(firstInvalidLine(lines)).toEqual({ key: 2, field: 'description' });
    expect(firstInvalidLine([line({ key: 7, categoryId: null, description: '' })])).toEqual({ key: 7, field: 'category' });
    expect(firstInvalidLine([line({ key: 8, hours: 0, description: '' })])).toEqual({ key: 8, field: 'hours' });
  });
  it('a whitespace-only description blocks, a 3-character one does not', () => {
    expect(firstInvalidLine([line({ description: '   ' })])).toEqual({ key: 1, field: 'description' });
    expect(firstInvalidLine([line({ description: 'abc' })])).toBeNull();
  });
  it('lineProblems reports the same description message the row shows', () => {
    expect(lineProblems(line({ description: '' })).description).toBe(descriptionError(''));
  });
});

describe('draftErrorMessage', () => {
  it('explains that a description problem is what blocked the draft', () => {
    expect(draftErrorMessage('Row 2: Description must be 3–4000 characters'))
      .toBe("Can't save draft yet — Row 2: Description must be 3–4000 characters");
  });
  it('leaves unrelated errors untouched', () => {
    expect(draftErrorMessage('Cannot log an EOD entry for a future date')).toBe('Cannot log an EOD entry for a future date');
  });
});

describe('draftBlockReason — a row with no category cannot be stored, and the user is told which', () => {
  it('null when every row has a category (a short description no longer blocks a draft)', () => {
    expect(draftBlockReason([line(), line({ key: 2, description: '' })])).toBeNull();
    expect(draftBlockReason([])).toBeNull();
  });
  it('names the first row without a category, and never drops rows', () => {
    const lines = [line(), line({ key: 2, categoryId: null }), line({ key: 3, categoryId: null })];
    expect(draftBlockReason(lines)).toBe('Row 2 has no category — pick one so the draft can be saved.');
    expect(lines).toHaveLength(3);
  });
});
