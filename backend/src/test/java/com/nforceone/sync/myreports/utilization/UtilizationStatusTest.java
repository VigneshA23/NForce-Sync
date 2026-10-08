package com.nforceone.sync.myreports.utilization;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UtilizationStatusTest {

    private static final BigDecimal UNDER = new BigDecimal("60");
    private static final BigDecimal OVER = new BigDecimal("100");

    private static UtilizationStatus classify(String pct, boolean submitted) {
        return UtilizationStatus.classify(new BigDecimal(pct), 1, submitted, UNDER, OVER);
    }

    @Test
    void classifiesAtTheExactThresholds() {
        assertThat(classify("59", true)).isEqualTo(UtilizationStatus.UNDER);
        assertThat(classify("60", true)).isEqualTo(UtilizationStatus.OPTIMAL);   // under is strictly "< 60"
        assertThat(classify("100", true)).isEqualTo(UtilizationStatus.OPTIMAL);  // over is strictly "> 100"
        assertThat(classify("101", true)).isEqualTo(UtilizationStatus.OVER);
    }

    @Test
    void classifiesBetweenWholeNumbers() {
        assertThat(classify("59.99", true)).isEqualTo(UtilizationStatus.UNDER);
        assertThat(classify("100.01", true)).isEqualTo(UtilizationStatus.OVER);
        assertThat(classify("0.00", true)).isEqualTo(UtilizationStatus.UNDER);
    }

    @Test
    void usesTheConfiguredThresholdsNotHardcodedOnes() {
        BigDecimal pct = new BigDecimal("75");
        assertThat(UtilizationStatus.classify(pct, 1, true, new BigDecimal("80"), new BigDecimal("120")))
                .isEqualTo(UtilizationStatus.UNDER);
        assertThat(UtilizationStatus.classify(pct, 1, true, new BigDecimal("50"), new BigDecimal("70")))
                .isEqualTo(UtilizationStatus.OVER);
    }

    @Test
    void noSubmittedEntryIsNoneRegardlessOfPercentage() {
        assertThat(classify("0.00", false)).isEqualTo(UtilizationStatus.NONE);
    }

    @Test
    void noAvailableDayIsUnavailableEvenWithoutAPercentage() {
        assertThat(UtilizationStatus.classify(null, 0, false, UNDER, OVER)).isEqualTo(UtilizationStatus.UNAVAILABLE);
        // unavailable wins over "none": a member on leave all period didn't fail to log anything.
        assertThat(UtilizationStatus.classify(null, 0, true, UNDER, OVER)).isEqualTo(UtilizationStatus.UNAVAILABLE);
        assertThat(UtilizationStatus.classify(BigDecimal.ZERO, 0, false, UNDER, OVER)).isEqualTo(UtilizationStatus.UNAVAILABLE);
    }

    @Test
    void serialisesLowercase() {
        assertThat(List.of(UtilizationStatus.values()).stream().map(UtilizationStatus::wire).toList())
                .containsExactly("optimal", "under", "over", "none", "unavailable");
    }
}
