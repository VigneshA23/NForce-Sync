package com.nforceone.sync.utilization;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;

public class UtilizationCalculator {

    static final BigDecimal STANDARD_DAY_HOURS = BigDecimal.valueOf(8);

    static BigDecimal computeAvailableHours(LocalDate date, boolean isCompanyHoliday, boolean isApprovedFullDayLeave) {
        return computeAvailableHours(date, isCompanyHoliday, isApprovedFullDayLeave, STANDARD_DAY_HOURS);
    }

    /**
     * Same weekend/holiday/approved-full-day-leave rule as the no-arg-hours overload above, but
     * parameterized on the configured working-hours-per-day instead of the hardcoded org default —
     * reused by callers (e.g. the PM Planned vs Actual dashboard) that must honor
     * {@code BusinessRuleConfig.workingHoursPerDay} rather than assume 8.
     */
    public static BigDecimal computeAvailableHours(LocalDate date, boolean isCompanyHoliday,
                                                     boolean isApprovedFullDayLeave, BigDecimal standardDayHours) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
            return BigDecimal.ZERO;
        }
        if (isCompanyHoliday || isApprovedFullDayLeave) {
            return BigDecimal.ZERO;
        }
        return standardDayHours;
    }

    // Returns null when available == 0 (weekend/holiday → N/A, never 0%).
    // Returns 0.00 when approved == 0 but available > 0 (logged nothing on a workday).
    // Uncapped — values > 100 are stored as-is.
    public static BigDecimal computeUtilizationPct(BigDecimal approvedHours, BigDecimal availableHours) {
        if (availableHours.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return approvedHours
                .divide(availableHours, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }
}
