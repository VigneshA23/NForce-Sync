package com.nforceone.sync.myreports.utilization;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.function.Predicate;

/**
 * A resolved Day / Week / Month window plus the equivalent comparison window.
 *
 * <p>The selectable window is always inside the CURRENT month and only ever covers completed days
 * (today is never included — its EODs are not due yet). The comparison window is the previous
 * working day / previous calendar week / previous calendar month and may fall outside the current
 * month.
 *
 * <p>When the month has no completed working day yet (e.g. on the 1st), {@link #hasCompletedDays()}
 * is false and every date is null. Week is the exception to "current week": while the current week
 * has no completed working day (a Monday) it falls back to the most recent completed week — see
 * {@link #weekFallback()} — and only reports no completed days if that too has none inside the month.
 *
 * <p>"Working day" here means not a weekend and not a company holiday. Approved leave is per-employee
 * and is handled when members are aggregated, not when the window is resolved.
 */
record UtilizationPeriod(
        UtilizationPeriodType type,
        boolean hasCompletedDays,
        LocalDate from,
        LocalDate to,
        LocalDate previousFrom,
        LocalDate previousTo,
        /** WEEK only: the current week has no completed working day yet, so this is the most recent
         *  completed Mon–Fri week instead (still clipped to the current month). */
        boolean weekFallback
) {

    static UtilizationPeriod resolve(UtilizationPeriodType type, LocalDate today, Predicate<LocalDate> isHoliday) {
        LocalDate monthStart = today.withDayOfMonth(1);
        LocalDate latest = latestCompletedWorkingDay(today, isHoliday);

        switch (type) {
            case DAY: {
                if (latest == null) return none(type);
                LocalDate prev = previousWorkingDay(latest, isHoliday);
                return new UtilizationPeriod(type, true, latest, latest, prev, prev, false);
            }
            case WEEK: {
                if (latest == null) return none(type);
                LocalDate weekMonday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                LocalDate from = weekMonday.isBefore(monthStart) ? monthStart : weekMonday;
                if (!latest.isBefore(from)) {
                    return new UtilizationPeriod(type, true, from, latest,
                            weekMonday.minusWeeks(1), weekMonday.minusDays(1), false);
                }
                // The current week has nothing completed yet (a Monday, or a Monday holiday): show the
                // most recent completed Mon–Fri week instead, clipped to this month. `latest` is the
                // last completed working day and lies before this week, so it is that week's last day
                // — provided it is not before the month's first day or that week's own Monday.
                LocalDate fbMonday = weekMonday.minusWeeks(1);
                LocalDate fbFrom = fbMonday.isBefore(monthStart) ? monthStart : fbMonday;
                if (latest.isBefore(fbFrom)) return none(type);
                return new UtilizationPeriod(type, true, fbFrom, latest,
                        fbMonday.minusWeeks(1), fbMonday.minusDays(1), true);
            }
            case MONTH: {
                if (latest == null) return none(type);
                return new UtilizationPeriod(type, true, monthStart, latest,
                        monthStart.minusMonths(1), monthStart.minusDays(1), false);
            }
            default:
                throw new IllegalStateException("Unhandled period " + type);
        }
    }

    static boolean isWorkingDay(LocalDate date, Predicate<LocalDate> isHoliday) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) return false;
        return !isHoliday.test(date);
    }

    /** Latest working day strictly before {@code today} that is still in {@code today}'s month, or null. */
    static LocalDate latestCompletedWorkingDay(LocalDate today, Predicate<LocalDate> isHoliday) {
        LocalDate monthStart = today.withDayOfMonth(1);
        for (LocalDate d = today.minusDays(1); !d.isBefore(monthStart); d = d.minusDays(1)) {
            if (isWorkingDay(d, isHoliday)) return d;
        }
        return null;
    }

    /** The working day before {@code date}; may fall in an earlier month. Null if none within a year. */
    static LocalDate previousWorkingDay(LocalDate date, Predicate<LocalDate> isHoliday) {
        for (int i = 1; i <= 366; i++) {
            LocalDate d = date.minusDays(i);
            if (isWorkingDay(d, isHoliday)) return d;
        }
        return null;
    }

    private static UtilizationPeriod none(UtilizationPeriodType type) {
        return new UtilizationPeriod(type, false, null, null, null, null, false);
    }

    boolean hasPrevious() {
        return previousFrom != null && previousTo != null;
    }
}
