import { describe, expect, it } from 'vitest';
import { eodStatusViewQuery, parseEodStatusView } from './eodStatusView';

const TODAY = '2026-10-08';

describe('Team EOD Status view state in the URL', () => {
  it('round-trips date, search and status through list → detail → back (and a refresh)', () => {
    const view = { date: '2026-10-02', q: 'rae @nforce', status: 'MISSING' as const };

    // list → detail URL
    const detailQuery = eodStatusViewQuery(view);
    // detail page parses it (a refresh re-parses the very same URL)
    const onDetail = parseEodStatusView(new URLSearchParams(detailQuery), TODAY);
    const onDetailAfterRefresh = parseEodStatusView(new URLSearchParams(detailQuery), TODAY);
    // detail → back link → list parses it
    const onList = parseEodStatusView(new URLSearchParams(eodStatusViewQuery(onDetail)), TODAY);

    expect(onDetail).toEqual(view);
    expect(onDetailAfterRefresh).toEqual(view);
    expect(onList).toEqual(view);
  });

  it('omits empty search and absent status but always keeps the date explicit', () => {
    expect(eodStatusViewQuery({ date: TODAY, q: '', status: null })).toBe('date=2026-10-08');
  });

  it('falls back to today for a missing, malformed or future date', () => {
    expect(parseEodStatusView(new URLSearchParams(''), TODAY).date).toBe(TODAY);
    expect(parseEodStatusView(new URLSearchParams('date=nope'), TODAY).date).toBe(TODAY);
    expect(parseEodStatusView(new URLSearchParams('date=2026-10-09'), TODAY).date).toBe(TODAY);
  });

  it('ignores an unknown status and drops stray params from the rebuilt URL', () => {
    const view = parseEodStatusView(new URLSearchParams('date=2026-10-01&status=BOGUS&evil=1'), TODAY);
    expect(view.status).toBeNull();
    expect(eodStatusViewQuery(view)).toBe('date=2026-10-01');
  });
});
