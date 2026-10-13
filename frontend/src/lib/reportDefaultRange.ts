import { resolvePreset, sameRange, type DateRange } from './dateRange';

/**
 * Starting range for the report pages (EOD Reports, PM Reports and Lead Reports, each with its "EOD by
 * employee" and "Missing EOD" tabs): the current month up to today. Pure functions over an injectable
 * `today` so the 1st-of-month and mid-month behaviour is unit-tested (reportDefaultRange.test.ts); the
 * pages pass no `today`, so the range is computed from the local clock at mount — never hard-coded.
 */

/** Shown under the filter row while the dates are still the default range. */
export const CURRENT_MONTH_NOTE =
  'Showing the current month up to today. Change the date range to view the desired dates.';

/** The range a report starts with, and is restored to by its reset button: the 1st of the current
 *  month through today. */
export function initialReportRange(today: Date = new Date()): DateRange {
  return resolvePreset('thisMonth', today);
}

/** True only while the page still shows the untouched default range, so the note never claims
 *  "current month" over dates the user has since changed or cleared. */
export function showsCurrentMonthNote(range: DateRange, today: Date = new Date()): boolean {
  return sameRange(range, resolvePreset('thisMonth', today));
}
