package com.nforceone.sync.businessrules;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * The single definition of how a shift's times map onto real instants.
 *
 * <p>A shift is stored as two bare {@link LocalTime}s, so an end at or before the start means it
 * crosses midnight (Evening is 15:30-00:30). That rule was previously re-derived in three places —
 * duration in {@code EodService}, next-day rollover in {@code EmployeeService}, and again in the
 * frontend — which is how the cutoff ended up wrong for night shifts. Everything server-side that
 * needs a shift boundary should come through here.
 */
public final class ShiftSchedule {

    private static final int MINUTES_PER_DAY = 24 * 60;

    private ShiftSchedule() {}

    /**
     * Shift length in minutes. An end at or before the start crosses midnight, so a day is added
     * rather than yielding a negative duration.
     *
     * <p>Note this is the shift's SPAN, not paid time: a 15:30-00:30 shift spans 540 minutes but
     * may only be 480 of work, because the unpaid break is not modelled on the shift. Expected
     * hours come from {@code business_rule_config.standard_hours_per_day}, not from here.
     */
    public static int durationMinutes(ShiftDefinition shift) {
        int start = shift.getStartTime().getHour() * 60 + shift.getStartTime().getMinute();
        int end   = shift.getEndTime().getHour()   * 60 + shift.getEndTime().getMinute();
        if (end <= start) end += MINUTES_PER_DAY;
        return end - start;
    }

    /**
     * The instant a shift started on {@code workDate} actually ends — the following day when the
     * shift crosses midnight.
     *
     * @param workDate the date the shift STARTED, which is the date its EOD entry is filed under
     */
    public static LocalDateTime endAt(ShiftDefinition shift, LocalDate workDate) {
        return LocalDateTime.of(workDate, shift.getStartTime()).plusMinutes(durationMinutes(shift));
    }

    /**
     * When the EOD for {@code workDate} becomes overdue: the shift's end plus its configured
     * cutoff hours. Returns null when the shift has no cutoff configured, meaning no deadline and
     * no reminder.
     *
     * <p>Because it is anchored to the shift's end rather than compared as a time-of-day, a
     * 15:30-00:30 shift with a 3h cutoff lands correctly at 03:30 the day after the work date,
     * with no rollover flag needed.
     */
    public static LocalDateTime cutoffAt(ShiftDefinition shift, LocalDate workDate) {
        BigDecimal hours = shift.getEodCutoffHours();
        if (hours == null) return null;
        long seconds = hours.multiply(BigDecimal.valueOf(3600)).longValue();
        return endAt(shift, workDate).plus(Duration.ofSeconds(seconds));
    }
}
