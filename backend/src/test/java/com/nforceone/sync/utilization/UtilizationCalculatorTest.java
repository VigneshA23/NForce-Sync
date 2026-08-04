package com.nforceone.sync.utilization;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class UtilizationCalculatorTest {

    @Test
    void weekend_returns_null_utilization() {
        LocalDate saturday = LocalDate.of(2026, 7, 18); // confirmed Saturday
        BigDecimal available = UtilizationCalculator.computeAvailableHours(saturday, false, false);
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(BigDecimal.ZERO, available);
        // available == 0 → N/A, never 0%
        assertNull(pct, "weekend must return null, not 0.00");
    }

    @Test
    void company_holiday_returns_null_utilization() {
        LocalDate monday = LocalDate.of(2026, 7, 20); // confirmed weekday
        BigDecimal available = UtilizationCalculator.computeAvailableHours(monday, true, false);
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(BigDecimal.ZERO, available);
        assertNull(pct, "company holiday must return null, not 0.00");
    }

    @Test
    void approved_full_day_leave_returns_null_utilization() {
        LocalDate monday = LocalDate.of(2026, 7, 20); // confirmed weekday
        BigDecimal available = UtilizationCalculator.computeAvailableHours(monday, false, true);
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(BigDecimal.ZERO, available);
        assertNull(pct, "approved full-day leave must return null, not 0.00");
    }

    @Test
    void normal_workday_with_no_approved_hours_yet_is_0_not_null() {
        LocalDate monday = LocalDate.of(2026, 7, 20); // confirmed weekday
        BigDecimal available = UtilizationCalculator.computeAvailableHours(monday, false, false);
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(BigDecimal.ZERO, available);
        assertNotNull(pct, "workday with no approved hours yet must be 0.00, not N/A");
        assertEquals(new BigDecimal("0.00"), pct);
    }

    @Test
    void six_of_eight_approved_hours_is_75_pct() {
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(
                new BigDecimal("6"), new BigDecimal("8"));
        assertEquals(new BigDecimal("75.00"), pct);
    }

    @Test
    void zero_approved_with_available_hours_is_0_not_null() {
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(
                BigDecimal.ZERO, new BigDecimal("8"));
        // 0 approved + workday available → 0.00 (logged nothing), distinct from weekend null
        assertNotNull(pct, "0 approved on a workday must return 0.00, not null");
        assertEquals(new BigDecimal("0.00"), pct);
    }

    @Test
    void over_100_pct_is_stored_uncapped() {
        BigDecimal pct = UtilizationCalculator.computeUtilizationPct(
                new BigDecimal("10"), new BigDecimal("8"));
        assertEquals(new BigDecimal("125.00"), pct);
    }
}
