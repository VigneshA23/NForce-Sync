import { describe, expect, it } from 'vitest';
import {
  benchHoursMessage, benchHoursRuleApplies, benchTargetHours, clearedCategoriesNotice, descriptionError, draftBlockReason,
  draftErrorMessage, firstInvalidLine, lineProblems, maxBenchLineHours,
  noCategoriesMessage, staleCategoryRows, statusProblemMessages, type LineFields,
} from './dailyLogValidation';

const line = (over: Partial<LineFields> = {}): LineFields =>
  ({ key: 1, categoryId: 5, hours: 1, description: 'Standup', taskStatus: 'COMPLETED', blockerReason: '', ...over });

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

describe('bench Working day — lines + time adjustment = the bench day', () => {
  const ls = (...hours: number[]) => hours.map((h, i) => ({ key: i + 1, hours: h }));

  it('the rule applies to a bench Working day only', () => {
    expect(benchHoursRuleApplies(true, 'WORKING_DAY', false)).toBe(true);
    expect(benchHoursRuleApplies(false, 'WORKING_DAY', false)).toBe(false); // allocated / PM / Admin
    for (const d of ['LEAVE', 'HOLIDAY', 'WEEKEND', 'FIRST_HALF_LEAVE', 'SECOND_HALF_LEAVE'])
      expect(benchHoursRuleApplies(true, d, false)).toBe(false);
    expect(benchHoursRuleApplies(true, 'WORKING_DAY', true)).toBe(false); // "Mark as leave day"
  });
  it('the target is the server\'s bench day less the adjustment — 7.0 for an hour, never below 6.0', () => {
    expect(benchTargetHours(8, 0)).toBe(8);
    expect(benchTargetHours(8, 60)).toBe(7);
    expect(benchTargetHours(8, 45)).toBe(7.25);
    expect(benchTargetHours(8, 120)).toBe(6);
    expect(benchTargetHours(7.5, 30)).toBe(7); // follows the server value if it moves
  });
  it('exactly the target passes — 7.5 + 0.5 is 8, not 7.999…', () => {
    expect(benchHoursMessage(ls(8), 8)).toBeNull();
    expect(benchHoursMessage(ls(7.5, 0.5), 8)).toBeNull();
    expect(benchHoursMessage(ls(0.1 * 3 + 7.7), 8)).toBeNull(); // float noise rounds to the quarter grid
    expect(benchHoursMessage(ls(2.25, 2.25, 3.5), 8)).toBeNull();
    expect(benchHoursMessage(ls(7), 7, 60)).toBeNull();
    expect(benchHoursMessage(ls(3.5, 2.5), 6, 120)).toBeNull();
  });
  it('under and over the target give the message, and say why when an adjustment moved it', () => {
    expect(benchHoursMessage(ls(7.75), 8)).toBe('Bench Daily Log must total exactly 8.0 hrs (currently 7.75 hrs).');
    expect(benchHoursMessage(ls(8, 0.25), 8)).toContain('exactly 8.0 hrs');
    expect(benchHoursMessage([], 8)).toContain('currently 0.00 hrs');
    // 8.0 is the right answer with no adjustment but one hour too many with a 60-minute one.
    expect(benchHoursMessage(ls(8), 7, 60))
      .toBe('Bench Daily Log must total exactly 7.0 hrs with your time adjustment of 60 minutes (currently 8.00 hrs).');
  });
  it('a line is capped at the target minus the other lines, never below one step', () => {
    expect(maxBenchLineHours(ls(2, 3), 1, 8)).toBe(5);
    expect(maxBenchLineHours(ls(2, 3), 2, 8)).toBe(6);
    expect(maxBenchLineHours(ls(2, 3), 1, 7)).toBe(4); // an adjustment lowers the cap
    expect(maxBenchLineHours(ls(8, 1), 2, 8)).toBe(0.25);
    expect(maxBenchLineHours(ls(4), 1, 8)).toBe(8);
  });
});

describe('Status and Blocker reason on a Daily Log line — the same rules as Submit EOD', () => {
  it('a line with no status is invalid inline and in the banner, worded "Row n:"', () => {
    const bad = line({ taskStatus: '' });
    expect(lineProblems(bad).status).toBe('Status is required');
    expect(statusProblemMessages([line(), bad])).toEqual(['Row 2: status is required.']);
  });
  it('every one of the four statuses is accepted', () => {
    for (const s of ['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED'])
      expect(lineProblems(line({ taskStatus: s })).status).toBeUndefined();
    expect(lineProblems(line({ taskStatus: 'BLOCKED', blockerReason: 'Waiting on access' })).status).toBeUndefined();
  });
  it('Blocked needs a reason — only Blocked', () => {
    expect(lineProblems(line({ taskStatus: 'BLOCKED', blockerReason: '   ' })).blockerReason)
      .toBe('Blocker reason is required when status is Blocked');
    expect(statusProblemMessages([line({ taskStatus: 'BLOCKED', blockerReason: '' })]))
      .toEqual(['Row 1: blocker reason is required when status is Blocked.']);
    expect(lineProblems(line({ taskStatus: 'IN_PROGRESS', blockerReason: '' })).blockerReason).toBeUndefined();
  });
  it('valid lines produce no messages', () => {
    expect(statusProblemMessages([line(), line({ key: 2, taskStatus: 'BLOCKED', blockerReason: 'x' })])).toEqual([]);
  });
  it('the first invalid control is the status when only that is wrong, and the reason after it', () => {
    expect(firstInvalidLine([line({ taskStatus: '' })])).toEqual({ key: 1, field: 'status' });
    expect(firstInvalidLine([line({ taskStatus: 'BLOCKED', blockerReason: '' })])).toEqual({ key: 1, field: 'blockerReason' });
    expect(firstInvalidLine([line({ taskStatus: '', description: '' })])).toEqual({ key: 1, field: 'description' });
  });
});
