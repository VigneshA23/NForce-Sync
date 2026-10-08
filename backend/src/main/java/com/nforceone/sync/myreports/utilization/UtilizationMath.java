package com.nforceone.sync.myreports.utilization;

import com.nforceone.sync.utilization.UtilizationCalculator;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

/**
 * Pure aggregation for the Team Utilization page — no repositories, so it is unit-testable.
 *
 * <p>Utilization = approved productive hours ÷ (configured standard hours × available working days),
 * exactly the Team Lead / PM / Executive definition. The standard hours come from Business Rules and
 * are passed in; {@link UtilizationCalculator#computeUtilizationPct} is reused only for its rounding.
 */
final class UtilizationMath {

    private UtilizationMath() {}

    /** What one employee did on one calendar day. */
    record DayFacts(
            LocalDate date,
            boolean workingDay,          // not weekend, not company holiday
            boolean approvedLeave,       // DayType.LEAVE + APPROVED — the only leave that shrinks the denominator
            boolean submitted,           // SUBMITTED / PARTIALLY_APPROVED / APPROVED
            boolean pendingApproval,     // SUBMITTED or PARTIALLY_APPROVED (still has pieces to approve)
            BigDecimal approvedProductiveHours
    ) {
        /** Whether this day is in the utilization denominator. */
        boolean available() {
            return workingDay && !approvedLeave;
        }
    }

    record MemberAggregate(
            int availableDays,
            int loggedDays,
            BigDecimal hours,
            BigDecimal avgHoursPerDay,
            BigDecimal pct,
            boolean hasSubmittedEntry,
            boolean hasPendingApproval
    ) {
        UtilizationStatus status(BigDecimal underPct, BigDecimal overPct) {
            return UtilizationStatus.classify(pct, availableDays, hasSubmittedEntry, underPct, overPct);
        }
    }

    static MemberAggregate aggregate(List<DayFacts> days, BigDecimal standardDayHours) {
        int available = 0;
        int logged = 0;
        boolean hasSubmitted = false;
        boolean hasPending = false;
        BigDecimal hours = BigDecimal.ZERO;

        for (DayFacts d : days) {
            if (d.workingDay() && d.pendingApproval()) hasPending = true;
            // Hours and "submitted" only count on days that are in the denominator, so a stray
            // entry on a weekend / holiday / approved-leave day can never inflate the numerator.
            if (!d.available()) continue;
            available++;
            if (d.submitted()) {
                logged++;
                hasSubmitted = true;
            }
            hours = hours.add(d.approvedProductiveHours());
        }

        if (available == 0) {
            return new MemberAggregate(0, 0, BigDecimal.ZERO, null, null, false, hasPending);
        }
        BigDecimal capacity = standardDayHours.multiply(BigDecimal.valueOf(available));
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(hours, capacity);
        BigDecimal avg = hours.divide(BigDecimal.valueOf(available), 2, RoundingMode.HALF_UP);
        return new MemberAggregate(available, logged, hours, avg, pct, hasSubmitted, hasPending);
    }

    /**
     * Mean utilization across members who had an available day. Members with 0% (or no EOD at all)
     * ARE counted — dropping them would shrink the denominator and inflate the average (the
     * survivorship-bias bug fixed on the Team Lead dashboard). Only members with no available day
     * (null pct) are excluded. Null when nobody qualifies.
     */
    static BigDecimal average(List<BigDecimal> memberPcts) {
        List<BigDecimal> counted = memberPcts.stream().filter(p -> p != null).toList();
        if (counted.isEmpty()) return null;
        BigDecimal sum = counted.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return sum.divide(BigDecimal.valueOf(counted.size()), 2, RoundingMode.HALF_UP);
    }
}
