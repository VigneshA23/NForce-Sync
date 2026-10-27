package com.nforceone.sync.reports;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.config.BusinessClock;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.org.DesignationRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.reports.dto.MissingEodReportDto;
import com.nforceone.sync.teamlead.LeadTeamPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

/** A bench employee whose Daily Log (PLAIN_LOG, no tasks) was submitted must not be reported as missing. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TeamMissingEodBenchDailyLogTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 10, 5);

    @Mock AppUserRepository appUserRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock EodEntryRepository eodEntryRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock DesignationRepository designationRepository;
    @Mock NotificationService notificationService;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock ProjectRepository projectRepository;
    @Mock LeadTeamPolicy leadTeamPolicy;

    private TeamMissingEodReportService service;
    private AppUser admin, bench;

    @BeforeEach
    void setUp() {
        admin = user(1L, "Admin", AppUser.Role.SUPERADMIN);
        bench = user(2L, "Bench Person", AppUser.Role.EMPLOYEE);
        bench.setStatus(AppUser.Status.ACTIVE);
        admin.setStatus(AppUser.Status.ACTIVE);
        when(appUserRepository.findByEmailAndDeletedAtIsNull(admin.getEmail())).thenReturn(Optional.of(admin));
        when(appUserRepository.findAll()).thenReturn(List.of(admin, bench));
        when(allocationRepository.findActiveInRangeForEmployees(anyList(), any(), any())).thenReturn(List.of());
        when(holidayRepository.findByHolidayDateBetween(any(), any())).thenReturn(List.of());
        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setAtRiskMissingPct(new BigDecimal("30"));
        when(configRepository.findById(1L)).thenReturn(Optional.of(config));
        service = new TeamMissingEodReportService(appUserRepository, allocationRepository, eodEntryRepository,
                holidayRepository, configRepository, designationRepository, notificationService, shiftRepository,
                projectRepository, leadTeamPolicy, new BusinessClock(BusinessClock.DEFAULT_ZONE));
    }

    private static AppUser user(Long id, String name, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmployeeCode("E" + id);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        u.setRole(role);
        return u;
    }

    private EodEntry dailyLog(EodEntry.Status status, String hours) {
        EodEntry e = new EodEntry();
        e.setId(50L);
        e.setEmployee(bench);
        e.setEntryDate(MONDAY);
        e.setStatus(status);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setDayType(EodEntry.DayType.WORKING_DAY);
        e.setLogTotalHours(new BigDecimal(hours));
        e.setTasks(new ArrayList<>());
        return e;
    }

    private MissingEodReportDto report(EodEntry... entries) {
        when(eodEntryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(anyList(), any(), any()))
                .thenReturn(List.of(entries));
        return service.getReport(admin.getEmail(), MONDAY, MONDAY, null, null);
    }

    @Test
    void aSubmittedBenchDailyLogIsNotMissing() {
        assertTrue(report(dailyLog(EodEntry.Status.SUBMITTED, "8.0")).employees().stream()
                .noneMatch(r -> r.employeeId() == 2L));
    }

    @Test
    void anApprovedBenchDailyLogIsNotMissing() {
        assertTrue(report(dailyLog(EodEntry.Status.APPROVED, "8.0")).employees().stream()
                .noneMatch(r -> r.employeeId() == 2L));
    }

    @Test
    void aBenchDailyLogThatWasNeverSubmittedIsStillMissing() {
        MissingEodReportDto none = report();
        assertEquals(1, none.employees().stream().filter(r -> r.employeeId() == 2L).count());
        MissingEodReportDto draft = report(dailyLog(EodEntry.Status.DRAFT, "4.0"));
        assertEquals(1, draft.employees().stream().filter(r -> r.employeeId() == 2L).count());
    }
}
