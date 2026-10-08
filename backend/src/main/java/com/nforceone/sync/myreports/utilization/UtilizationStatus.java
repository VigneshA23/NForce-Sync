package com.nforceone.sync.myreports.utilization;

import com.fasterxml.jackson.annotation.JsonValue;

import java.math.BigDecimal;

/**
 * Where a member (or a single day) sits against the configured utilization thresholds.
 *
 * <p>This is the ONE place the classification lives — the frontend only displays what it is given.
 * Serialised lowercase ("optimal", "under", "over", "none", "unavailable").
 */
public enum UtilizationStatus {
    /** Between the under and over thresholds, inclusive. */
    OPTIMAL,
    /** Below the under threshold, but the member did submit EODs. */
    UNDER,
    /** Above the over threshold. */
    OVER,
    /** No submitted EOD (any status, pending included) on any day they were available. */
    NONE,
    /** No available working day in the period (all weekend / holiday / approved full-day leave). */
    UNAVAILABLE;

    @JsonValue
    public String wire() {
        return name().toLowerCase();
    }

    /**
     * @param pct              utilization %, null when there was no available day
     * @param availableDays    working days that count in the denominator
     * @param hasSubmittedEntry at least one submitted EOD (SUBMITTED / PARTIALLY_APPROVED / APPROVED)
     *                          on an available day. A submitted-but-unapproved EOD counts here, so a
     *                          pending-only member is classified by their (0%) percentage — UNDER —
     *                          not NONE.
     * @param underPct         configured underutilized_threshold_pct (strictly below → UNDER)
     * @param overPct          configured overloaded_threshold_pct (strictly above → OVER)
     */
    public static UtilizationStatus classify(BigDecimal pct, int availableDays, boolean hasSubmittedEntry,
                                             BigDecimal underPct, BigDecimal overPct) {
        if (availableDays <= 0 || pct == null) return UNAVAILABLE;
        if (!hasSubmittedEntry) return NONE;
        if (pct.compareTo(underPct) < 0) return UNDER;
        if (pct.compareTo(overPct) > 0) return OVER;
        return OPTIMAL;
    }
}
