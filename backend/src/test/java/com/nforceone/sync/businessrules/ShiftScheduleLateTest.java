package com.nforceone.sync.businessrules;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * "Late" compares the stored submission instant with the cutoff instant. Hibernate hands back an OffsetDateTime
 * in the JVM's zone, so squeezing it through {@code toLocalDateTime()} and comparing to an IST wall-clock cutoff
 * was wrong on any host not running in IST. The instant comparison is the same everywhere.
 */
class ShiftScheduleLateTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalDate FRIDAY = LocalDate.of(2026, 10, 23);

    private TimeZone originalDefault;

    @BeforeEach
    void remember() { originalDefault = TimeZone.getDefault(); }

    @AfterEach
    void restore() { TimeZone.setDefault(originalDefault); }

    private static ShiftDefinition evening() {
        return ShiftDefinition.builder().name("Evening")
                .startTime(LocalTime.of(15, 30)).endTime(LocalTime.of(0, 30))
                .eodCutoffHours(BigDecimal.valueOf(2)).build();      // Friday's EOD is due 02:30 IST Saturday
    }

    private static ShiftDefinition day() {
        return ShiftDefinition.builder().name("Day")
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0))
                .eodCutoffHours(BigDecimal.valueOf(3)).build();      // due 21:00 IST the same day
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void lateOnlyAfterTheCutoffInstant_whateverOffsetTheTimestampCarries(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 02:35 IST Saturday == 21:05 UTC Friday: five minutes late. Read as UTC wall-clock it looked "on time".
        OffsetDateTime lateUtc = OffsetDateTime.parse("2026-10-23T21:05:00Z");
        OffsetDateTime lateIst = lateUtc.withOffsetSameInstant(ZoneOffset.ofHoursMinutes(5, 30));
        OffsetDateTime onTimeUtc = OffsetDateTime.parse("2026-10-23T20:55:00Z");

        assertTrue(ShiftSchedule.isSubmittedLate(evening(), FRIDAY, lateUtc, IST));
        assertTrue(ShiftSchedule.isSubmittedLate(evening(), FRIDAY, lateIst, IST));
        assertFalse(ShiftSchedule.isSubmittedLate(evening(), FRIDAY, onTimeUtc, IST));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void dayShiftSubmittedAt2200IstIsLate_evenThoughItIs1630Utc(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        assertTrue(ShiftSchedule.isSubmittedLate(day(), FRIDAY, OffsetDateTime.parse("2026-10-23T16:30:00Z"), IST));
        assertFalse(ShiftSchedule.isSubmittedLate(day(), FRIDAY, OffsetDateTime.parse("2026-10-23T15:00:00Z"), IST));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata"})
    void noShiftNoCutoffOrNoSubmissionIsNeverLate(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        OffsetDateTime any = OffsetDateTime.parse("2030-01-01T00:00:00Z");
        ShiftDefinition noCutoff = ShiftDefinition.builder().name("Open")
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0)).build();
        assertFalse(ShiftSchedule.isSubmittedLate(null, FRIDAY, any, IST));
        assertFalse(ShiftSchedule.isSubmittedLate(noCutoff, FRIDAY, any, IST));
        assertFalse(ShiftSchedule.isSubmittedLate(evening(), FRIDAY, null, IST));
    }
}
