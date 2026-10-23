import { describe, expect, it } from 'vitest';
import {
  clearedCategoriesNotice, descriptionError, draftBlockReason, draftErrorMessage, firstInvalidLine, lineProblems,
  noCategoriesMessage, staleCategoryRows, type LineFields,
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

describe('stale category handling — the server picks the list per date, so carried-over categories are cleared', () => {
  it('flags only rows whose category is not in the allowed list', () => {
    const lines = [line({ key: 1, categoryId: 5 }), line({ key: 2, categoryId: 9 }), line({ key: 3, categoryId: null })];
    expect(staleCategoryRows(lines, [5, 6])).toEqual([1]);
  });

  it('a row with no category yet is not stale, and an empty allowed list makes every chosen category stale', () => {
    expect(staleCategoryRows([line({ categoryId: null })], [])).toEqual([]);
    expect(staleCategoryRows([line({ key: 1, categoryId: 5 }), line({ key: 2, categoryId: 6 })], [])).toEqual([0, 1]);
  });

  it('notice names the row(s), one or several, and is null when nothing was cleared', () => {
    expect(clearedCategoriesNotice([])).toBeNull();
    expect(clearedCategoriesNotice([1])).toBe("Row 2's category isn't available for this date, so it was cleared. Pick one from the list.");
    expect(clearedCategoriesNotice([0, 2])).toBe("Rows 1, 3's categories aren't available for this date, so they were cleared. Pick one from the list.");
  });
});

describe('noCategoriesMessage', () => {
  it('bench mode points at the administrator, not Org Masters', () => {
    expect(noCategoriesMessage(true)).toEqual({
      lead: 'No Bench Log categories are configured. Please contact your administrator.',
    });
  });
  it('every other role keeps the existing Org Masters wording', () => {
    const m = noCategoriesMessage(false);
    expect(m.lead + m.admin + m.tail).toBe('No categories configured. Go to Org Masters → Task Categories and add categories with scope "Management".');
  });
});
