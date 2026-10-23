package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.BenchModePolicy;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodService;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.Allocation;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.reports.dto.MissingEodReportDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The PM Missing EOD report and the Submit EOD missing-day scan must give the same answer for the same employee
 * at the same moment — whatever the JVM zone. Both go through {@code ShiftSchedule.isPastDue} and the same
 * {@link BusinessClock}; this pins that they keep doing so.
 */
class MissingEodAgreementTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalDate FRIDAY = LocalDate.of(2026, 10, 23);

    private TimeZone originalDefault;

    @BeforeEach
    void remember() { originalDefault = TimeZone.getDefault(); }

    @AfterEach
    void restore() { TimeZone.setDefault(originalDefault); }

    // Evening shift 15:30-00:30, 2h cutoff: Friday's EOD is due at 02:30 IST Saturday == 21:00 UTC Friday.
    @ParameterizedTest
    @CsvSource({
            "UTC,                 2026-10-23T20:59:00Z, false",
            "UTC,                 2026-10-23T21:01:00Z, true",
            "Asia/Kolkata,        2026-10-23T20:59:00Z, false",
            "Asia/Kolkata,        2026-10-23T21:01:00Z, true",
            "America/Los_Angeles, 2026-10-23T20:59:00Z, false",
            "America/Los_Angeles, 2026-10-23T21:01:00Z, true",
    })
    void reportAndScanAgree(String jvmZone, String instant, boolean expectMissing) {
        TimeZone.setDefault(TimeZone.getTimeZone(jvmZone));
        BusinessClock clock = new BusinessClock(IST, Clock.fixed(Instant.parse(instant), ZoneId.of("UTC")));

        ShiftDefinition evening = ShiftDefinition.builder().name("Evening")
                .startTime(LocalTime.of(15, 30)).endTime(LocalTime.of(0, 30))
                .eodCutoffHours(BigDecimal.valueOf(2)).build();
        ShiftDefinitionRepository shifts = mock(ShiftDefinitionRepository.class);
        when(shifts.findById(7L)).thenReturn(Optional.of(evening));
        HolidayRepository holidays = mock(HolidayRepository.class);
        when(holidays.findByHolidayDateBetween(any(), any())).thenReturn(List.of());
        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setWeekendRule(BusinessRuleConfig.WeekendRule.SAT_SUN);
        config.setAtRiskMissingPct(new BigDecimal("30"));
        BusinessRuleConfigRepository configs = mock(BusinessRuleConfigRepository.class);
        when(configs.findById(1L)).thenReturn(Optional.of(config));

        AppUser employee = new AppUser();
        employee.setId(10L);
        employee.setShiftId(7L);
        employee.setFullName("Sita");
        AppUser pm = new AppUser();
        pm.setId(1L);
        pm.setEmail("pm@example.com");
        Project project = new Project();
        project.setId(20L);
        project.setName("Alpha");
        Allocation allocation = new Allocation();
        allocation.setEmployee(employee);
        allocation.setProject(project);

        AppUserRepository users = mock(AppUserRepository.class);
        when(users.findByEmailAndDeletedAtIsNull("pm@example.com")).thenReturn(Optional.of(pm));
        PmScopeService scope = mock(PmScopeService.class);
        when(scope.scopedProjects(pm)).thenReturn(List.of(project));
        when(scope.memberAllocations(any(), any(), any(), any())).thenReturn(List.of(allocation));
        EodEntryRepository entries = mock(EodEntryRepository.class);
        when(entries.findWithTasksByEmployeeIdInAndEntryDateBetween(any(), any(), any())).thenReturn(List.of());

        MissingEodReportService report = new MissingEodReportService(users, mock(ProjectRepository.class),
                mock(AllocationRepository.class), entries, holidays, configs, mock(DesignationRepository.class),
                mock(NotificationService.class), shifts, scope, clock);
        EodService scan = new EodService(entries, null, users, null, null, null, configs, shifts, holidays, null, null,
                null, null, null, null, null, null, null, mock(BenchModePolicy.class), clock);

        MissingEodReportDto reportResult = report.getReport("pm@example.com", FRIDAY, FRIDAY, null, null, null);
        boolean reportSaysMissing = reportResult.totalMissingDays() == 1;
        List<?> scanDays = org.springframework.test.util.ReflectionTestUtils.invokeMethod(scan, "buildMissingDays", employee, List.of(), FRIDAY, FRIDAY);
        boolean scanSaysMissing = scanDays.size() == 1;

        assertThat(reportSaysMissing).as("Missing EOD report").isEqualTo(expectMissing);
        assertThat(scanSaysMissing).as("Submit EOD missing-day scan").isEqualTo(expectMissing);
        assertThat(reportSaysMissing).isEqualTo(scanSaysMissing);
    }
}
