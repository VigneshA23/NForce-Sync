package com.nforceone.sync.employee;

import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftSchedule;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.employee.dto.DashboardSummaryDto.CutoffStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The deployed host runs the JVM in UTC, a developer machine in IST. The cutoff, "now" and "today" must come out
 * identical either way, because they are read in the business zone — never the JVM default.
 */
class CutoffStatusZoneTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalDate WORK_DATE = LocalDate.of(2026, 10, 23);

    private TimeZone originalDefault;

    @BeforeEach
    void remember() { originalDefault = TimeZone.getDefault(); }

    @AfterEach
    void restore() { TimeZone.setDefault(originalDefault); }

    /** The evening shift, 15:30-00:30, with a 2h cutoff: 02:30 the next day, IST. */
    private static ShiftDefinition evening() {
        return ShiftDefinition.builder().name("Evening")
                .startTime(LocalTime.of(15, 30)).endTime(LocalTime.of(0, 30))
                .eodCutoffHours(BigDecimal.valueOf(2)).build();
    }

    private static BusinessClock clockAt(String isoInstant) {
        return new BusinessClock(IST, Clock.fixed(Instant.parse(isoInstant), ZoneId.of("UTC")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void cutoffInstantIs0230IstNextDay_whateverTheJvmZone(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 2:30 AM IST on the 24th is 21:00 UTC on the 23rd.
        assertEquals(Instant.parse("2026-10-23T21:00:00Z"), ShiftSchedule.cutoffInstant(evening(), WORK_DATE, IST));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void countdownAt1815Ist_is8h15m_whateverTheJvmZone(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 18:15 IST == 12:45 UTC — the exact moment from the bug report.
        CutoffStatus s = EmployeeService.cutoffStatus(WORK_DATE, null, evening(), clockAt("2026-10-23T12:45:00Z"));

        assertEquals(Duration.ofHours(8).plusMinutes(15),
                Duration.between(s.serverNowInstant(), s.cutoffAt()));
        assertEquals(LocalTime.of(2, 30), s.cutoffTime());
        assertTrue(s.cutoffNextDay());
        assertFalse(s.cutoffPassed());
        assertEquals("Asia/Kolkata", s.zone());
        // Legacy wall-clock fields now agree with the instants: 18:15 in the business zone, not the host's.
        assertEquals(LocalTime.of(18, 15), s.serverNow().toLocalTime());
        assertEquals(Instant.parse("2026-10-23T21:00:00Z"), s.cutoffAt().toInstant());
    }

    @Test
    void cutoffPassedOnlyAfterTheIstCutoff() {
        // 20:59 UTC is 02:29 IST — still open; 21:01 UTC is 02:31 IST — closed.
        assertFalse(EmployeeService.cutoffStatus(WORK_DATE, null, evening(), clockAt("2026-10-23T20:59:00Z")).cutoffPassed());
        assertTrue(EmployeeService.cutoffStatus(WORK_DATE, null, evening(), clockAt("2026-10-23T21:01:00Z")).cutoffPassed());
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata"})
    void todayIsTheBusinessDate_whateverTheJvmZone(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 19:00 UTC on the 23rd is 00:30 IST on the 24th: the business day has already rolled over,
        // though a UTC host's LocalDate.now() would still say the 23rd.
        assertEquals(LocalDate.of(2026, 10, 24), clockAt("2026-10-23T19:00:00Z").today());
        assertEquals(LocalDate.of(2026, 10, 23), clockAt("2026-10-23T18:29:00Z").today());
    }

    @Test
    void noShiftOrNoCutoff_hasNoDeadlineButStillReportsTheClock() {
        BusinessClock clock = clockAt("2026-10-23T12:45:00Z");
        CutoffStatus none = EmployeeService.cutoffStatus(WORK_DATE, null, null, clock);
        assertNull(none.cutoffTime());
        assertNull(none.cutoffAt());
        assertEquals("Asia/Kolkata", none.zone());

        ShiftDefinition noCutoff = ShiftDefinition.builder().name("Open")
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0)).build();
        assertNull(EmployeeService.cutoffStatus(WORK_DATE, null, noCutoff, clock).cutoffAt());
    }

    @Test
    void zoneIsAParameter_aDifferentZoneMovesTheInstant() {
        // The hook for the paused per-employee time zone work: same wall-clock cutoff, different zone.
        ZoneId utc = ZoneId.of("UTC");
        assertEquals(Instant.parse("2026-10-24T02:30:00Z"), ShiftSchedule.cutoffInstant(evening(), WORK_DATE, utc));
    }
}
