package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.dto.EodEntryDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Past-due / missing-day and future-date decisions follow the business zone, not the JVM default: the same
 * instant gives the same answer on a UTC host, an IST laptop and anywhere else.
 */
class EodServiceZoneTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalDate FRIDAY = LocalDate.of(2026, 10, 23);

    private TimeZone originalDefault;

    @BeforeEach
    void remember() { originalDefault = TimeZone.getDefault(); }

    @AfterEach
    void restore() { TimeZone.setDefault(originalDefault); }

    private static EodService serviceAt(String isoInstant) {
        ShiftDefinition evening = ShiftDefinition.builder().name("Evening")
                .startTime(LocalTime.of(15, 30)).endTime(LocalTime.of(0, 30))
                .eodCutoffHours(BigDecimal.valueOf(2)).build();       // cutoff 02:30 IST the next morning
        ShiftDefinitionRepository shifts = mock(ShiftDefinitionRepository.class);
        when(shifts.findById(7L)).thenReturn(Optional.of(evening));
        HolidayRepository holidays = mock(HolidayRepository.class);
        when(holidays.findByHolidayDateBetween(any(), any())).thenReturn(List.of());
        BusinessRuleConfigRepository config = mock(BusinessRuleConfigRepository.class);
        when(config.findById(1L)).thenReturn(Optional.empty());      // weekend rule falls back to SAT_SUN
        BusinessClock clock = new BusinessClock(IST, Clock.fixed(Instant.parse(isoInstant), ZoneId.of("UTC")));
        return new EodService(null, null, null, null, null, null, config, shifts, holidays, null, null, null,
                null, null, null, null, null, null, mock(BenchModePolicy.class), clock);
    }

    private static AppUser employee() {
        AppUser e = new AppUser();
        e.setId(1L);
        e.setShiftId(7L);
        e.setFullName("Test Employee");
        return e;
    }

    private static List<EodEntryDto> missingForFriday(EodService s) {
        return s.buildMissingDays(employee(), List.of(), FRIDAY, FRIDAY);
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void fridayIsNotMissingUntilTheIstCutoffPasses(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 20:59 UTC is 02:29 IST on Saturday — one minute left on Friday's EOD.
        assertEquals(0, missingForFriday(serviceAt("2026-10-23T20:59:00Z")).size());
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void fridayIsMissingOnceTheIstCutoffHasPassed(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 21:01 UTC is 02:31 IST. A UTC-default JVM used to read 21:01 local — still before 02:30 "tomorrow".
        List<EodEntryDto> missing = missingForFriday(serviceAt("2026-10-23T21:01:00Z"));
        assertEquals(1, missing.size());
        assertEquals(FRIDAY, missing.get(0).entryDate());
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void dayDefaultsWithNoDateUseTheBusinessToday(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 19:00 UTC Friday is 00:30 IST Saturday — the business "today" is the weekend, whatever the host says.
        Clock at = Clock.fixed(Instant.parse("2026-10-23T19:00:00Z"), ZoneId.of("UTC"));
        AppUserRepository users = mock(AppUserRepository.class);
        when(users.findByEmailAndDeletedAtIsNull("e@x.com")).thenReturn(Optional.of(employee()));
        HolidayRepository holidays = mock(HolidayRepository.class);
        BusinessRuleConfigRepository config = mock(BusinessRuleConfigRepository.class);
        when(config.findById(1L)).thenReturn(Optional.empty());
        EodService s = new EodService(null, null, users, null, null, null, config, null, holidays, null, null,
                null, null, null, null, null, null, null, mock(BenchModePolicy.class), new BusinessClock(IST, at));

        assertEquals("WEEKEND", s.getDayDefaults(null, "e@x.com").dayType());
        verify(holidays).existsByHolidayDate(LocalDate.of(2026, 10, 24));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void timeAdjustmentContextWithNoDateUsesTheBusinessMonthDay(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // Last instant of Oct 31 UTC is 05:29 IST Nov 1: the adjustment month is November, not October.
        Clock at = Clock.fixed(Instant.parse("2026-10-31T23:59:00Z"), ZoneId.of("UTC"));
        AppUser e = employee();
        AppUserRepository users = mock(AppUserRepository.class);
        when(users.findByEmailAndDeletedAtIsNull("e@x.com")).thenReturn(Optional.of(e));
        ShiftDefinition shift = ShiftDefinition.builder().name("Day")
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(18, 0)).build();
        ShiftDefinitionRepository shifts = mock(ShiftDefinitionRepository.class);
        when(shifts.findById(7L)).thenReturn(Optional.of(shift));
        BusinessRuleConfigRepository config = mock(BusinessRuleConfigRepository.class);
        when(config.findById(1L)).thenReturn(Optional.empty());
        EodEntryRepository entries = mock(EodEntryRepository.class);
        when(entries.findByEmployeeIdAndEntryDate(any(), any())).thenReturn(Optional.empty());
        EodService s = new EodService(entries, null, users, null, null, null, config, shifts, null, null, null,
                null, null, null, null, null, null, null, mock(BenchModePolicy.class), new BusinessClock(IST, at));
        try { s.getTimeAdjustmentContext(null, "e@x.com"); } catch (RuntimeException ignored) { /* usage query not mocked */ }

        verify(entries).findByEmployeeIdAndEntryDate(1L, LocalDate.of(2026, 11, 1));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void futureDateIsJudgedAgainstTheBusinessDate(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 19:00 UTC on the 23rd is 00:30 IST on the 24th: the 24th is "today" for the workforce, so logging it
        // is fine (a UTC host used to reject it as a future date); the 25th is still the future.
        EodService s = serviceAt("2026-10-23T19:00:00Z");
        assertDoesNotThrow(() -> s.requireNotFutureDate(LocalDate.of(2026, 10, 24)));
        assertThrows(ResponseStatusException.class, () -> s.requireNotFutureDate(LocalDate.of(2026, 10, 25)));
    }
}
