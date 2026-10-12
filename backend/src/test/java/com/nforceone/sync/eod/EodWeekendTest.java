package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.dto.SaveEodRequest;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Weekend lock + "I worked on this day": day-type enforcement (incl. the Business Rules weekend
 * rule and holidays), task validation, and overtime flagging. The private helpers are driven via
 * ReflectionTestUtils, as the other EodService unit tests do.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EodWeekendTest {

    // 2026-10-10 is a Saturday, 2026-10-11 a Sunday, 2026-10-09 a Friday — all in the past.
    private static final LocalDate SAT = LocalDate.of(2026, 10, 10);
    private static final LocalDate SUN = LocalDate.of(2026, 10, 11);
    private static final LocalDate FRI = LocalDate.of(2026, 10, 9);

    @Mock BusinessRuleConfigRepository configRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;

    private EodService service;
    private BusinessRuleConfig config;

    @BeforeEach
    void setUp() {
        // Constructor order: entryRepo, taskRepo, userRepo, projectRepo, categoryRepo, actionRepo,
        // configRepo, shiftRepo, holidayRepo, attachmentService, notificationService,
        // approvalPieceRouter, projectApprovalRepo, accessPolicy, leadAccess, allocationRepo,
        // auditLogRepo, logLineRepo
        service = new EodService(entryRepository, null, userRepository, null, null, null,
                configRepository, null, holidayRepository, null, null, null, null, null, null, null,
                null, null);
        config = new BusinessRuleConfig();
        config.setWeekendRule(BusinessRuleConfig.WeekendRule.SAT_SUN);
        when(configRepository.findById(1L)).thenReturn(Optional.of(config));
    }

    // ── resolveDayType ────────────────────────────────────────────────────────

    private EodEntry.DayType resolve(EodEntry.DayType requested, LocalDate date) {
        return ReflectionTestUtils.invokeMethod(service, "resolveDayType", requested, date);
    }

    private void assertBadRequest(Runnable r) {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, r::run);
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void weekendDate_resolvesToWeekend_forWeekendOrNull() {
        assertEquals(EodEntry.DayType.WEEKEND, resolve(EodEntry.DayType.WEEKEND, SAT));
        assertEquals(EodEntry.DayType.WEEKEND, resolve(null, SUN));
    }

    @Test
    void weekendDate_rejectsAnyOtherDayType() {
        for (EodEntry.DayType other : new EodEntry.DayType[] {
                EodEntry.DayType.WORKING_DAY, EodEntry.DayType.LEAVE, EodEntry.DayType.HOLIDAY,
                EodEntry.DayType.FIRST_HALF_LEAVE, EodEntry.DayType.SECOND_HALF_LEAVE}) {
            assertBadRequest(() -> resolve(other, SAT));
        }
    }

    @Test
    void weekday_keepsNormalSelector_andRejectsWeekend() {
        assertEquals(EodEntry.DayType.WORKING_DAY, resolve(null, FRI));
        assertEquals(EodEntry.DayType.LEAVE, resolve(EodEntry.DayType.LEAVE, FRI));
        assertBadRequest(() -> resolve(EodEntry.DayType.WEEKEND, FRI));
    }

    @Test
    void sunOnlyRule_saturdayIsAWorkingDay_notLocked() {
        config.setWeekendRule(BusinessRuleConfig.WeekendRule.SUN_ONLY);
        assertEquals(EodEntry.DayType.WORKING_DAY, resolve(EodEntry.DayType.WORKING_DAY, SAT));
        assertBadRequest(() -> resolve(EodEntry.DayType.WEEKEND, SAT));
        // Sunday is always off, whatever the rule.
        assertBadRequest(() -> resolve(EodEntry.DayType.WORKING_DAY, SUN));
    }

    @Test
    void holidayOnWeekend_holidayWins_soNoLock() {
        when(holidayRepository.existsByHolidayDate(SAT)).thenReturn(true);
        assertEquals(EodEntry.DayType.HOLIDAY, resolve(EodEntry.DayType.HOLIDAY, SAT));
        assertEquals(EodEntry.DayType.WORKING_DAY, resolve(EodEntry.DayType.WORKING_DAY, SAT));
    }

    // ── direct API call with the wrong day type ───────────────────────────────

    @Test
    void saveDraft_onWeekendWithWorkingDay_isRejectedWith400() {
        AppUser employee = new AppUser();
        employee.setId(1L);
        employee.setRole(AppUser.Role.EMPLOYEE);
        when(userRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(employee));
        when(entryRepository.findByEmployeeIdAndEntryDate(any(), any())).thenReturn(Optional.empty());

        SaveEodRequest req = new SaveEodRequest(SAT, EodEntry.DayType.WORKING_DAY, null, null, "Office",
                null, "plan", null, java.util.List.of(), java.util.List.of(), null, null, null, null, null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.saveDraft(req, "a@b.c"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("WEEKEND"));
    }

    // ── validation ────────────────────────────────────────────────────────────

    private EodEntry weekendEntry(boolean worked) {
        EodEntry e = new EodEntry();
        e.setDayType(EodEntry.DayType.WEEKEND);
        e.setWeekendWorked(worked);
        return e;
    }

    private void validate(EodEntry e) {
        ReflectionTestUtils.invokeMethod(service, "validateLoggedDay", e);
    }

    @Test
    void noWorkWeekend_submitsWithZeroTasks_noPlanNeeded() {
        assertDoesNotThrow(() -> validate(weekendEntry(false)));
    }

    @Test
    void workedWeekend_requiresAtLeastOneTask() {
        assertBadRequest(() -> validate(weekendEntry(true)));
    }

    @Test
    void workingDay_stillRequiresTasks() {
        EodEntry e = new EodEntry();
        e.setDayType(EodEntry.DayType.WORKING_DAY);
        assertBadRequest(() -> validate(e));
    }

    // ── overtime ──────────────────────────────────────────────────────────────

    private void task(EodEntry e, String hours) {
        EodTask t = new EodTask();
        t.setHours(new BigDecimal(hours));
        e.getTasks().add(t);
    }

    @Test
    void workedWeekend_everyHourIsOvertime() {
        EodEntry e = weekendEntry(true);
        task(e, "3.00");
        ReflectionTestUtils.invokeMethod(service, "applyOvertime", e, new AppUser());
        assertTrue(e.getIsOvertime());
        assertEquals(0, new BigDecimal("3.00").compareTo(e.getOvertimeHours()));
    }

    @Test
    void noWorkWeekend_isZeroHours_notOvertime() {
        EodEntry e = weekendEntry(false);
        e.setIsOvertime(true);
        e.setOvertimeHours(new BigDecimal("1.00"));
        ReflectionTestUtils.invokeMethod(service, "applyOvertime", e, new AppUser());
        assertFalse(e.getIsOvertime());
        assertNull(e.getOvertimeHours());
    }
}
