package com.nforceone.sync.eod;

import java.math.BigDecimal;

/**
 * Stateless validation rules for PLAIN_LOG submissions.
 * Extracted from EodService for testability — same rules, no Spring dependency.
 */
public final class PlainLogValidation {

    private static final BigDecimal MAX_HOURS = BigDecimal.valueOf(24);

    private PlainLogValidation() {}

    /**
     * Validates a PLAIN_LOG submission payload.
     *
     * @return error message, or {@code null} when valid
     */
    public static String validate(BigDecimal hours, String summary, String notes) {
        if (hours == null) {
            return "Total hours is required for a daily log submission.";
        }
        if (hours.compareTo(BigDecimal.ZERO) < 0 || hours.compareTo(MAX_HOURS) > 0) {
            return "Hours must be between 0 and 24.";
        }
        // Enforce 15-minute granularity: hours × 4 must be a whole number.
        BigDecimal quarters = hours.multiply(BigDecimal.valueOf(4));
        if (quarters.stripTrailingZeros().scale() > 0) {
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

        if (notes != null && notes.length() > 8000) {
            return "Additional notes must be 8000 characters or fewer.";
        }

        return null;
    }
}
