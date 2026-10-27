package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.reporting.ReportingScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/** A bench-mode Working day must submit exactly 8.0 hrs; nothing else is held to it. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BenchWorkingDayHoursTest {

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock ReportingScopeService reportingScope;
    @Mock ProjectRepository projectRepository;

    private EodService service;

    @BeforeEach
    void setUp() {
        BenchModePolicy policy = new BenchModePolicy(allocationRepository, reportingScope, projectRepository);
        service = new EodService(entryRepository, null, userRepository, null, null, null,
                null, null, null, null, null, null, null, null, null, allocationRepository,
                null, logLineRepository, policy);
    }

    private EodEntry entry(boolean bench, EodEntry.DayType dayType) {
        AppUser owner = new AppUser();
        owner.setId(1L);
        owner.setRole(AppUser.Role.EMPLOYEE);
        EodEntry e = new EodEntry();
        e.setId(77L);
        e.setEmployee(owner);
        e.setEntryDate(LocalDate.of(2026, 10, 9));
        e.setStatus(EodEntry.Status.DRAFT);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setBenchMode(bench);
        e.setDayType(dayType);
        e.setWorkLocation("Office");
        e.setNextDayPlan("Plan");
        return e;
    }

    private void lines(boolean bench, String... hours) {
        TaskCategory c = new TaskCategory();
        c.setId(5L);
        c.setScope(bench ? "BENCH" : "MANAGEMENT");
        List<EodLogLine> out = new ArrayList<>();
        int i = 0;
        for (String h : hours) {
            EodLogLine l = new EodLogLine();
            l.setCategory(c);
            l.setHours(new BigDecimal(h));
            l.setDescription("worked on something");
            l.setSortOrder(i++);
            l.setTaskStatus(EodTask.TaskStatus.COMPLETED);
            out.add(l);
        }
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(77L)).thenReturn(out);
    }

    private void validate(EodEntry e) {
        ReflectionTestUtils.invokeMethod(service, "validatePlainLog", e);
    }

    @Test
    void benchWorkingDayUnderEightIsBlockedWithTheStandardErrorShape() {
        lines(true, "7.75");
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> validate(entry(true, EodEntry.DayType.WORKING_DAY)));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("exactly 8.0 hrs"), ex.getReason());
    }

    @Test
    void benchWorkingDayOverEightIsBlocked() {
        lines(true, "8.25");
        assertThrows(ResponseStatusException.class, () -> validate(entry(true, EodEntry.DayType.WORKING_DAY)));
    }

    @Test
    void benchWorkingDayWithNoLinesIsTheLeaveDayMarkerAndStillPasses() {
        lines(true);
        EodEntry marker = entry(true, EodEntry.DayType.WORKING_DAY);
        marker.setLogTotalHours(BigDecimal.ZERO);
        assertDoesNotThrow(() -> validate(marker));
    }

    @Test
    void exactlyEightPasses_andSevenPointFivePlusPointFiveEqualsEight() {
        lines(true, "8.00");
        assertDoesNotThrow(() -> validate(entry(true, EodEntry.DayType.WORKING_DAY)));
        lines(true, "7.5", "0.5");
        assertDoesNotThrow(() -> validate(entry(true, EodEntry.DayType.WORKING_DAY)));
        lines(true, "2.25", "2.25", "3.5");
        assertDoesNotThrow(() -> validate(entry(true, EodEntry.DayType.WORKING_DAY)));
    }

    @Test
    void leaveHolidayHalfLeaveAndWeekendKeepTheirBehaviour() {
        for (EodEntry.DayType t : List.of(EodEntry.DayType.LEAVE, EodEntry.DayType.HOLIDAY,
                EodEntry.DayType.FIRST_HALF_LEAVE, EodEntry.DayType.SECOND_HALF_LEAVE)) {
            lines(true, "4.0");
            assertDoesNotThrow(() -> validate(entry(true, t)), t.name());
        }
        lines(true);
        EodEntry weekend = entry(true, EodEntry.DayType.WEEKEND);
        weekend.setWeekendWorked(false);
        weekend.setLogTotalHours(BigDecimal.ZERO); // what saveDraft stores for a no-work weekend
        assertDoesNotThrow(() -> validate(weekend));
    }

    @Test
    void aNonBenchDailyLogIsNotHeldToEight() {
        lines(false, "3.0");
        assertDoesNotThrow(() -> validate(entry(false, EodEntry.DayType.WORKING_DAY)));
    }

    @Test
    void policyHelperComparesByValueNotScale() {
        assertNull(BenchModePolicy.workingDayHoursError(new BigDecimal("8"), null));
        assertNull(BenchModePolicy.workingDayHoursError(new BigDecimal("8.000"), null));
        assertNotNull(BenchModePolicy.workingDayHoursError(new BigDecimal("7.99"), null));
        assertNotNull(BenchModePolicy.workingDayHoursError(null, null));
    }

    @Test
    void aTimeAdjustmentLowersTheRequiredTotalByItsHours_neverBelowSix() {
        assertNull(BenchModePolicy.workingDayHoursError(new BigDecimal("7.0"), 60));
        assertNull(BenchModePolicy.workingDayHoursError(new BigDecimal("7.25"), 45));
        assertNull(BenchModePolicy.workingDayHoursError(new BigDecimal("6.0"), 120));
        String eightWithAdjustment = BenchModePolicy.workingDayHoursError(new BigDecimal("8.0"), 60);
        assertTrue(eightWithAdjustment.contains("exactly 7.0 hrs"), eightWithAdjustment);
        assertNotNull(BenchModePolicy.workingDayHoursError(new BigDecimal("5.75"), 120));
    }
}
