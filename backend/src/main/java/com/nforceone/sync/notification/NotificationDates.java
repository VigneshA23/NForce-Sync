package com.nforceone.sync.notification;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * How a date is written inside notification text.
 *
 * <p>Notifications were mixing formats: the missing-EOD reminder listed "Jul 2, Jul 3" with no
 * year at all (ambiguous once a gap is more than a year old, and misleading around a year
 * boundary), while approval messages used the raw ISO {@code 2026-07-01}. Both now read as
 * {@code 02-07-2026}, matching the DD-MM-YYYY the UI shows everywhere else.
 *
 * <p>Only for text a person reads. Dates inside links stay ISO — those are query parameters the
 * frontend parses, not prose.
 */
public final class NotificationDates {

    private static final DateTimeFormatter DAY_MONTH_YEAR = DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private NotificationDates() {}

    public static String format(LocalDate date) {
        return date.format(DAY_MONTH_YEAR);
    }
}
