package com.nforceone.sync.reports.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One task row on the EOD by Employee report.
 *
 * The time adjustment is a property of the DAY, not the task, so every task row of the same day
 * repeats it. Carried here anyway because a day with an approved adjustment logs fewer hours than
 * a full day, and without it the report shows the shortfall with nothing explaining it. The UI
 * prints it once, on the day's first row.
 */
public record EodByEmployeeEntryDto(
        Long entryId,
        LocalDate date,
        String projectCode,
        String categoryName,
        BigDecimal hours,
        /** LATE_ARRIVAL / INTERVENING / EARLY_LEAVE, or null on a day with no adjustment. */
        String timeAdjustmentType,
        Integer timeAdjustmentMinutes,
        /** WORKING_DAY / FIRST_HALF_LEAVE / SECOND_HALF_LEAVE / LEAVE / HOLIDAY / WEEKEND — same
         *  per-day repetition as the time-adjustment fields above; the UI prints the day's
         *  required-hours target (derived from this) once, on the day's first row. */
        String dayType) {
}
