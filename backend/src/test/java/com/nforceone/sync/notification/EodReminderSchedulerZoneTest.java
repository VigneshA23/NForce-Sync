package com.nforceone.sync.notification;

import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.EodEntryRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The reminder fires when the business-zone cutoff passes, however the JVM zone is set. */
class EodReminderSchedulerZoneTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private TimeZone originalDefault;

    @BeforeEach
    void remember() { originalDefault = TimeZone.getDefault(); }

    @AfterEach
    void restore() { TimeZone.setDefault(originalDefault); }

    private static EodReminderScheduler schedulerAt(String isoInstant) {
        // Evening 15:30-00:30 with a 2h cutoff: 02:30 IST the morning after the work date.
        ShiftDefinition evening = ShiftDefinition.builder().name("Evening")
                .startTime(LocalTime.of(15, 30)).endTime(LocalTime.of(0, 30))
                .eodCutoffHours(BigDecimal.valueOf(2)).build();
        ShiftDefinitionRepository shifts = mock(ShiftDefinitionRepository.class);
        when(shifts.findAllByOrderByStartTimeAsc()).thenReturn(List.of(evening));
        BusinessClock clock = new BusinessClock(IST, Clock.fixed(Instant.parse(isoInstant), ZoneId.of("UTC")));
        EodReminderScheduler real = new EodReminderScheduler(shifts, mock(AppUserRepository.class),
                mock(EodEntryRepository.class), mock(BusinessRuleConfigRepository.class), mock(HolidayRepository.class),
                mock(NotificationRepository.class), mock(NotificationService.class), clock);
        EodReminderScheduler spy = spy(real);
        doReturn(0).when(spy).sendRemindersForDate(any(), any(), any(), anyString());
        return spy;
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void firesJustAfterTheIstCutoff_forTheRightWorkDate(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        // 21:05 UTC on the 23rd is 02:35 IST on the 24th — five minutes past the 23rd's cutoff.
        // (A UTC-default JVM used to read this as 21:05 local, i.e. before the cutoff, and stay silent.)
        EodReminderScheduler s = schedulerAt("2026-10-23T21:05:00Z");
        LocalDateTime nowIst = LocalDateTime.of(2026, 10, 24, 2, 35);
        s.sendDueReminders(nowIst);

        ArgumentCaptor<OffsetDateTime> since = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(s).sendRemindersForDate(org.mockito.ArgumentMatchers.eq(LocalDate.of(2026, 10, 23)), any(),
                since.capture(), org.mockito.ArgumentMatchers.eq("Evening"));
        // The idempotency anchor is the real cutoff instant: 02:30 IST == 21:00 UTC.
        assertThat(since.getValue().toInstant()).isEqualTo(Instant.parse("2026-10-23T21:00:00Z"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void staysSilentBeforeTheCutoff(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        EodReminderScheduler s = schedulerAt("2026-10-23T12:45:00Z");   // 18:15 IST
        s.sendDueReminders(LocalDateTime.of(2026, 10, 23, 18, 15));
        verify(s, never()).sendRemindersForDate(any(), any(), any(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"UTC", "Asia/Kolkata", "America/Los_Angeles"})
    void publicEntryPointReadsTheBusinessClock(String jvmZone) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        EodReminderScheduler s = schedulerAt("2026-10-23T21:05:00Z");
        s.sendDueReminders();
        verify(s).sendRemindersForDate(org.mockito.ArgumentMatchers.eq(LocalDate.of(2026, 10, 23)), any(), any(), anyString());
    }
}
