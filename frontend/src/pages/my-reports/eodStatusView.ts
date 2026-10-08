import type { MemberEodStatus } from '../../api/teamLead';
import { STATUS_CFG } from './eodStatusConfig';

// The Team EOD Status list's whole view state — date, search text, status filter — lives in the
// URL, never component state. The detail page receives the same three params and rebuilds the
// list URL from them for its Back link, so Back (and a refresh on either page) restores the view.

export interface EodStatusView {
  date: string;
  q: string;
  status: MemberEodStatus | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the view from a URL, tolerating anything a hand-edited query string can throw at it:
 *  a malformed or future date falls back to today, an unknown status is ignored. */
export function parseEodStatusView(params: URLSearchParams, today: string): EodStatusView {
  const rawDate = params.get('date');
  const rawStatus = params.get('status');
  return {
    date: rawDate && ISO_DATE.test(rawDate) && rawDate <= today ? rawDate : today,
    q: params.get('q') ?? '',
    status: rawStatus && rawStatus in STATUS_CFG ? (rawStatus as MemberEodStatus) : null,
  };
}

/** Query string for the list or detail URL. The date is always explicit so a page left open
 *  across midnight doesn't silently shift to a different day when Back is pressed. */
export function eodStatusViewQuery(view: EodStatusView): string {
  const p = new URLSearchParams();
  p.set('date', view.date);
  if (view.q) p.set('q', view.q);
  if (view.status) p.set('status', view.status);
  return p.toString();
}
