package com.nforceone.sync.eod.dto;

import java.time.LocalTime;

/**
 * Everything the Submit EOD form needs to render the time-adjustment card, for the logged-in
 * employee. Exists as its own employee-scoped endpoint because shift definitions and the
 * allowance config both live behind /api/admin/business-rules, which is SUPERADMIN-only.
 *
 * shiftAssigned is false when the employee has no shift_id. There is then no start/end to
 * compute "reach office by" or expectedHours from, so the feature is unavailable.
 */
public record TimeAdjustmentContextDto(
        boolean   shiftAssigned,
        String    shiftName,
        LocalTime shiftStart,
        LocalTime shiftEnd,
        /** Handles overnight shifts (e.g. 15:30-00:30 = 540, not -900). */
        int       shiftDurationMinutes,

        /** One monthly pool of minutes shared across all three adjustment types (V62). */
        int monthlyAdjustmentMinutes,

        /**
         * Minutes already spent this calendar month, excluding drafts, rejected entries and the
         * day being edited — so the form can show what is genuinely left to spend.
         */
        long adjustmentMinutesUsed
) {
    public static TimeAdjustmentContextDto unassigned() {
        return new TimeAdjustmentContextDto(false, null, null, null, 0, 0, 0);
    }
}
