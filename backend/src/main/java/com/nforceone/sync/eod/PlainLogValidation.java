package com.nforceone.sync.eod;

import com.nforceone.sync.eod.dto.SaveEodLogLineRequest;

import java.math.BigDecimal;
import java.util.List;

/**
 * Stateless validation rules for PLAIN_LOG submissions.
 * Extracted from EodService for testability — same rules, no Spring dependency.
 *
 * V110: the primary path validates line items (SaveEodLogLineRequest list).
 * The legacy path (hours + summary) is still reachable for backward compat when logLines is null.
 */
public final class PlainLogValidation {

    private static final BigDecimal MAX_HOURS = BigDecimal.valueOf(24);
    private static final int MIN_DESC_LEN = 3;
    private static final int MAX_DESC_LEN = 4000;
    private static final int MAX_NOTES_LEN = 8000;

    private PlainLogValidation() {}

    /**
     * Validates a V110+ PLAIN_LOG submission with line items.
     *
     * <ul>
     *   <li>Empty list = leave day — valid (no line-level checks).
     *   <li>Non-empty: each line must have hours in (0, 24] in 0.25 steps and a description
     *       of 3–4000 characters.
     *   <li>Total hours across all lines must be in (0, 24] and in 0.25 steps.
     *   <li>logNotes, when present, must not exceed 8000 chars.
     * </ul>
     *
     * @return error message, or {@code null} when valid
     */
    public static String validate(List<SaveEodLogLineRequest> lines, String notes) {
        if (lines == null || lines.isEmpty()) {
            // Leave day — only notes length matters.
            return validateNotes(notes);
        }

        BigDecimal total = BigDecimal.ZERO;
        int row = 0;
        for (SaveEodLogLineRequest line : lines) {
            row++;
            if (line.hours() == null) {
                return "Row " + row + ": hours are required.";
            }
            if (line.hours().compareTo(BigDecimal.ZERO) <= 0) {
                return "Row " + row + ": hours must be greater than 0.";
            }
            if (line.hours().compareTo(MAX_HOURS) > 0) {
                return "Row " + row + ": hours cannot exceed 24.";
            }
            if (!isQuarterHour(line.hours())) {
                return "Row " + row + ": hours must be in 15-minute increments (e.g. 0.25, 0.5, 1.75).";
            }
            if (line.description() == null || line.description().isBlank()) {
                return "Row " + row + ": description is required.";
            }
            String desc = line.description().strip();
            if (desc.length() < MIN_DESC_LEN) {
                return "Row " + row + ": description must be at least " + MIN_DESC_LEN + " characters.";
            }
            if (desc.length() > MAX_DESC_LEN) {
                return "Row " + row + ": description must be " + MAX_DESC_LEN + " characters or fewer.";
            }
            total = total.add(line.hours());
        }

        if (total.compareTo(MAX_HOURS) > 0) {
            return "Total hours across all lines (" + total.toPlainString() + ") cannot exceed 24.";
        }
        if (!isQuarterHour(total)) {
            return "Total hours must be in 15-minute increments.";
        }

        return validateNotes(notes);
    }

    /**
     * Legacy validation — called when the client sends logTotalHours + logSummary (pre-V110).
     *
     * @return error message, or {@code null} when valid
     */
    public static String validateLegacy(BigDecimal hours, String summary, String notes) {
        if (hours == null) {
            return "Total hours is required for a daily log submission.";
        }
        if (hours.compareTo(BigDecimal.ZERO) < 0 || hours.compareTo(MAX_HOURS) > 0) {
            return "Hours must be between 0 and 24.";
        }
        if (!isQuarterHour(hours)) {
            return "Hours must be in 15-minute increments (e.g. 7.25, 7.5, 7.75).";
        }

        boolean isLeave = hours.compareTo(BigDecimal.ZERO) == 0;
        if (!isLeave) {
            if (summary == null || summary.isBlank()) {
                return "A work summary is required when logging hours.";
            }
            if (summary.strip().length() < 20) {
                return "Work summary must be at least 20 characters.";
            }
            if (summary.length() > 4000) {
                return "Work summary must be 4000 characters or fewer.";
            }
        }

        return validateNotes(notes);
    }

    private static String validateNotes(String notes) {
        if (notes != null && notes.length() > MAX_NOTES_LEN) {
            return "Additional notes must be " + MAX_NOTES_LEN + " characters or fewer.";
        }
        return null;
    }

    private static boolean isQuarterHour(BigDecimal hours) {
        BigDecimal quarters = hours.multiply(BigDecimal.valueOf(4));
        return quarters.stripTrailingZeros().scale() <= 0;
    }
}
