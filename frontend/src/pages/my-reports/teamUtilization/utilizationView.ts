import type { UtilizationPeriod, UtilizationStatus } from '../../../api/teamUtilization';
import type { SortKey, StatusFilter } from './utilizationLogic';

// The page's view state — tab, status filter, search, sort — lives in the URL, never component state,
// so a refresh (or coming back from another page) restores exactly what the user was looking at.
// Defaults are omitted from the URL to keep it clean.

export interface UtilizationView {
  period: UtilizationPeriod;
  filter: StatusFilter;
  q: string;
  sort: SortKey;
}

export const DEFAULT_VIEW: UtilizationView = { period: 'week', filter: null, q: '', sort: 'high' };

// Day is not offered in the UI; a stale ?period=day link falls back to the default.
const PERIODS: readonly UtilizationPeriod[] = ['week', 'month'];
const STATUSES: readonly UtilizationStatus[] = ['optimal', 'under', 'over', 'none', 'unavailable'];
const SORTS: readonly SortKey[] = ['high', 'low', 'name'];

/** Reads the view from a URL, ignoring anything a hand-edited query string can throw at it. */
export function parseUtilizationView(params: URLSearchParams): UtilizationView {
  const period = params.get('period');
  const filter = params.get('status');
  const sort = params.get('sort');
  return {
    period: PERIODS.includes(period as UtilizationPeriod) ? (period as UtilizationPeriod) : DEFAULT_VIEW.period,
    filter: STATUSES.includes(filter as UtilizationStatus) ? (filter as UtilizationStatus) : null,
    q: params.get('q') ?? '',
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_VIEW.sort,
  };
}

export function utilizationViewQuery(view: UtilizationView): string {
  const p = new URLSearchParams();
  if (view.period !== DEFAULT_VIEW.period) p.set('period', view.period);
  if (view.filter) p.set('status', view.filter);
  if (view.q) p.set('q', view.q);
  if (view.sort !== DEFAULT_VIEW.sort) p.set('sort', view.sort);
  return p.toString();
}
