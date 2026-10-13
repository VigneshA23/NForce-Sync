import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegacyLogNotice } from './LegacyLogNotice';

const legacy = { entryForm: 'PLAIN_LOG', logSummary: 'Prepared the weekly report\nReviewed PRs', logTotalHours: 8, logLines: [] };
const html = (props: Partial<Parameters<typeof LegacyLogNotice>[0]>) =>
  renderToStaticMarkup(<LegacyLogNotice entry={legacy} isEditable={false} dailyCap={8} {...props} />);

// `isEditable` is DailyLogForm's own editable(entry): true for no entry / DRAFT / REJECTED, false for
// SUBMITTED (Pending), PARTIALLY_APPROVED, APPROVED and MISSED. The mapping from status is the form's,
// so these cases pin what each side renders.
describe('LegacyLogNotice: locked (Pending / Approved)', () => {
  for (const state of ['Pending', 'Approved']) {
    it(`${state}: shows the "Daily log" label, the summary and the hours against the cap, read-only`, () => {
      const out = html({ isEditable: false });
      expect(out).toContain('Daily log');
      expect(out).toContain('Prepared the weekly report');
      expect(out).toContain('Reviewed PRs');
      expect(out).toContain('8.0');
      expect(out).toContain('/ 8.0 hrs');
      expect(out).not.toContain('Legacy entry format');
      expect(out).toContain('legacy-log-readonly');
    });
  }

  it('wraps a multi-line summary instead of collapsing it', () => {
    expect(html({ isEditable: false })).toContain('white-space:pre-wrap');
  });

  it('hours only when there is no summary', () => {
    const out = html({ isEditable: false, entry: { ...legacy, logSummary: null } });
    expect(out).toContain('Daily log');
    expect(out).toContain('8.0');
    expect(out).not.toContain('pre-wrap');
  });

  it('shows the hours against the form\'s daily cap, not a hard-coded 8', () => {
    expect(html({ isEditable: false, dailyCap: 9, entry: { ...legacy, logTotalHours: 7.5 } })).toContain('7.5');
    expect(html({ isEditable: false, dailyCap: 9 })).toContain('/ 9.0 hrs');
  });
});

describe('LegacyLogNotice: editable (draft / rejected)', () => {
  it('keeps the existing "Legacy entry format" notice with the summary', () => {
    const out = html({ isEditable: true });
    expect(out).toContain('Legacy entry format. Add line items below to convert.');
    expect(out).toContain('Prepared the weekly report');
    expect(out).not.toContain('legacy-log-readonly');
  });
});

describe('LegacyLogNotice: nothing legacy to show', () => {
  it('renders nothing for a structured entry, a leave day, an entry with lines, or no entry', () => {
    expect(html({ entry: { ...legacy, entryForm: 'PROJECT_GROUPED' } })).toBe('');
    expect(html({ entry: { ...legacy, logTotalHours: 0 } })).toBe('');
    expect(html({ entry: { ...legacy, logLines: [{ categoryName: 'Meetings' }] } })).toBe('');
    expect(html({ entry: null })).toBe('');
    expect(html({ entry: null, isEditable: true })).toBe('');
  });
});
