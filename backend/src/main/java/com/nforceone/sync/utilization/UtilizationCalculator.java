package com.nforceone.sync.utilization;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;

class UtilizationCalculator {

    static final BigDecimal STANDARD_DAY_HOURS = BigDecimal.valueOf(8);

    static BigDecimal computeAvailableHours(LocalDate date, boolean isCompanyHoliday, boolean isApprovedFullDayLeave) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
            return BigDecimal.ZERO;
        }
        if (isCompanyHoliday || isApprovedFullDayLeave) {
            return BigDecimal.ZERO;
        }
        return STANDARD_DAY_HOURS;
    }

    // Returns null when available == 0 (weekend/holiday → N/A, never 0%).
    // Returns 0.00 when approved == 0 but available > 0 (logged nothing on a workday).
    // Uncapped — values > 100 are stored as-is.
    static BigDecimal computeUtilizationPct(BigDecimal approvedHours, BigDecimal availableHours) {
        if (availableHours.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return approvedHours
                .divide(availableHours, 6, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }
}
