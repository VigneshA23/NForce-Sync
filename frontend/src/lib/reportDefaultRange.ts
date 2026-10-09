import { resolvePreset, sameRange, type DateRange } from './dateRange';

/**
 * Opt-in "current month up to today" starting range for the Super Admin EOD Reports page (both the
 * "EOD by employee" and "Missing EOD" tabs). The PM's own Reports page does not opt in, so it keeps
 * its blank dates. Pure functions over an injectable `today` so the 1st-of-month and mid-month
 * behaviour is unit-tested (reportDefaultRange.test.ts); the page passes no `today`, so the range is
 * computed from the local clock at mount — never hard-coded.
 */

/** Shown under the filter row while the dates are still the default range. */
export const CURRENT_MONTH_NOTE =
  'Showing the current month up to today. Change the date range to view the desired dates.';

/** The range a report starts with (and is restored to by its reset button): the current month up
 *  to today when opted in, otherwise blank — exactly the previous behaviour. */
export function initialReportRange(defaultToCurrentMonth: boolean, today: Date = new Date()): DateRange {
  return defaultToCurrentMonth ? resolvePreset('thisMonth', today) : { from: '', to: '' };
}

/** True only while an opted-in page still shows the untouched default range, so the note never
 *  claims "current month" over dates the user has since changed or cleared. */
export function showsCurrentMonthNote(
  defaultToCurrentMonth: boolean, range: DateRange, today: Date = new Date(),
): boolean {
  return defaultToCurrentMonth && sameRange(range, resolvePreset('thisMonth', today));
}
