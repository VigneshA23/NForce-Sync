package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuthController;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.ShiftDefinition;
import com.nforceone.sync.businessrules.ShiftDefinitionRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.SaveEodRequest;
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
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

/**
 * Time adjustment on the Daily Log (PLAIN_LOG): the same feature Submit EOD has, for the three kinds of user who
 * file it — an employee on the bench, and a PM or Admin with no active project — plus an allocated employee on the
 * task form as the regression. The bench employee alone is held to a total (8.0 minus the adjustment).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DailyLogTimeAdjustmentTest {

    private static final LocalDate PAST = LocalDate.of(2026, 10, 9); // a Friday, always in the past

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock ReportingScopeService reportingScope;
    @Mock ProjectRepository projectRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock ShiftDefinitionRepository shiftRepository;
    @Mock EodAttachmentService attachmentService;

    private EodService service;
    private BenchModePolicy policy;

    @BeforeEach
    void setUp() {
        policy = new BenchModePolicy(allocationRepository, reportingScope, projectRepository);
        service = new EodService(entryRepository, null, userRepository, null, null, null,
                configRepository, shiftRepository, null, attachmentService, null, null, null, null, null,
                allocationRepository, null, logLineRepository, policy);

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setMonthlyAdjustmentMinutes(120);
        config.setWorkingHoursPerDay(new BigDecimal("8.00"));
        when(configRepository.findById(1L)).thenReturn(Optional.of(config));

        ShiftDefinition evening = new ShiftDefinition();
        evening.setId(3L);
        evening.setName("Evening Shift");
        evening.setStartTime(LocalTime.of(15, 30));
        evening.setEndTime(LocalTime.of(0, 30));
        when(shiftRepository.findById(3L)).thenReturn(Optional.of(evening));

        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(attachmentService.loadForEntries(anyList()))
                .thenReturn(new EodAttachmentService.AttachmentsByScope(Map.of(), Map.of()));
        when(entryRepository.sumAdjustmentMinutesInPeriod(anyLong(), any(), any(), any())).thenReturn(0L);
    }

    // ── the three Daily Log users ────────────────────────────────────────────────

    private static AppUser user(long id, AppUser.Role role, boolean withShift) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        u.setEmail("u" + id + "@example.com");
        if (withShift) u.setShiftId(3L);
        AppUser mgr = new AppUser();
        mgr.setId(900L);
        u.setManager(mgr);
        return u;
    }

    /** A user on the Daily Log, and whether their entry is bench-mode (only an EMPLOYEE can be). */
    private record DailyLogUser(AppUser user, boolean bench) {}

    private List<DailyLogUser> everyDailyLogUser() {
        return List.of(
                new DailyLogUser(user(1L, AppUser.Role.EMPLOYEE, true), true),   // bench employee
                new DailyLogUser(user(2L, AppUser.Role.PM, true), false),        // bench PM
                new DailyLogUser(user(3L, AppUser.Role.ADMIN, true), false));    // bench Admin
    }

    private EodEntry plainEntry(DailyLogUser u, EodEntry.DayType dayType, EodEntry.TimeAdjustmentType type, Integer mins) {
        EodEntry e = new EodEntry();
        e.setId(77L);
        e.setEmployee(u.user());
        e.setEntryDate(PAST);
        e.setStatus(EodEntry.Status.DRAFT);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setBenchMode(u.bench());
        e.setDayType(dayType);
        e.setWorkLocation("Office");
        e.setNextDayPlan("Plan");
        e.setTimeAdjustmentType(type);
        e.setTimeAdjustmentMinutes(mins);
        return e;
    }

    private void persistedLines(DailyLogUser u, String... hours) {
        TaskCategory c = new TaskCategory();
        c.setId(5L);
        c.setScope(u.bench() ? "BENCH" : "MANAGEMENT");
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

    /** What submit() runs for a Daily Log, in its order: the adjustment first, then the entry. */
    private void submitChecks(EodEntry e, AppUser owner) {
        ReflectionTestUtils.invokeMethod(service, "validateTimeAdjustment", e, owner);
        ReflectionTestUtils.invokeMethod(service, "validatePlainLog", e);
    }

    private ResponseStatusException rejected(EodEntry e, AppUser owner) {
        return assertThrows(ResponseStatusException.class, () -> submitChecks(e, owner));
    }

    private static final EodEntry.TimeAdjustmentType LATE = EodEntry.TimeAdjustmentType.LATE_ARRIVAL;

    // ── submit, without an adjustment ────────────────────────────────────────────

    @Test
    void withoutAnAdjustment_benchMustTotalEight_pmAndAdminAreNotHeldToIt() {
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u, "8.0");
            assertDoesNotThrow(() -> submitChecks(plainEntry(u, EodEntry.DayType.WORKING_DAY, null, null), u.user()));
            persistedLines(u, "5.0");
            EodEntry five = plainEntry(u, EodEntry.DayType.WORKING_DAY, null, null);
            if (u.bench()) {
                assertTrue(rejected(five, u.user()).getReason().contains("exactly 8.0 hrs"));
            } else {
                assertDoesNotThrow(() -> submitChecks(five, u.user()));
            }
        }
    }

    // ── submit, with an adjustment ───────────────────────────────────────────────

    @Test
    void withAnAdjustment_benchTotalIsEightMinusIt_pmAndAdminKeepNoTarget() {
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u, "7.0");
            assertDoesNotThrow(() -> submitChecks(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 60), u.user()),
                    "7.0 with a 1h adjustment");
            persistedLines(u, "8.0");
            EodEntry eight = plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 60);
            if (u.bench()) {
                assertTrue(rejected(eight, u.user()).getReason().contains("exactly 7.0 hrs"));
            } else {
                assertDoesNotThrow(() -> submitChecks(eight, u.user()));
            }
        }
    }

    @Test
    void benchEmployeeWithTheMaximumAdjustmentNeedsSix() {
        DailyLogUser bench = everyDailyLogUser().get(0);
        persistedLines(bench, "6.0");
        assertDoesNotThrow(() -> submitChecks(
                plainEntry(bench, EodEntry.DayType.WORKING_DAY, EodEntry.TimeAdjustmentType.EARLY_LEAVE, 120), bench.user()));
    }

    // ── the shared rules still apply to a Daily Log adjustment ───────────────────

    @Test
    void invalidAdjustmentsAreRejectedForEveryDailyLogUser() {
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u, "7.0");
            assertEquals(HttpStatus.BAD_REQUEST,
                    rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 0), u.user()).getStatusCode(), "zero minutes");
            assertEquals(HttpStatus.BAD_REQUEST,
                    rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 150), u.user()).getStatusCode(), "over 2 h");
            assertEquals(HttpStatus.BAD_REQUEST,
                    rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, null, 60), u.user()).getStatusCode(), "minutes, no type");
        }
    }

    // ── no minimum: whatever is left in the pool can be used, in 15-minute steps ──

    @Test
    void twoHoursRemaining_anyStepUpToTwoHoursIsAccepted() {
        for (DailyLogUser u : everyDailyLogUser()) {
            // a bench log must total 8.0 minus the adjustment
            Map<Integer, String> hoursFor = Map.of(15, "7.75", 30, "7.5", 45, "7.25", 60, "7.0", 120, "6.0");
            for (Map.Entry<Integer, String> step : hoursFor.entrySet()) {
                persistedLines(u, step.getValue());
                assertDoesNotThrow(() -> submitChecks(
                        plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, step.getKey()), u.user()), step.getKey() + " min");
            }
        }
    }

    @Test
    void fifteenMinutesRemaining_fifteenIsAccepted_thirtyIsNot() {
        when(entryRepository.sumAdjustmentMinutesInPeriod(anyLong(), any(), any(), any())).thenReturn(105L);
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u, "7.75");
            assertDoesNotThrow(() -> submitChecks(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 15), u.user()));
            persistedLines(u, "7.5");
            ResponseStatusException ex = rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 30), u.user());
            assertTrue(ex.getReason().contains("15m of 2h left this month"), ex.getReason());
        }
    }

    @Test
    void nothingRemaining_everyDurationIsRejected() {
        when(entryRepository.sumAdjustmentMinutesInPeriod(anyLong(), any(), any(), any())).thenReturn(120L);
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u, "7.75");
            ResponseStatusException ex = rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 15), u.user());
            assertTrue(ex.getReason().contains("exceeds your monthly time adjustment budget"), ex.getReason());
        }
    }

    @Test
    void editingAnEntry_itsOwnAdjustmentIsNotCountedAgainstTheBalance() {
        DailyLogUser u = everyDailyLogUser().get(0);
        when(userRepository.findByEmailAndDeletedAtIsNull(u.user().getEmail())).thenReturn(Optional.of(u.user()));
        when(entryRepository.findByEmployeeIdAndEntryDate(u.user().getId(), PAST))
                .thenReturn(Optional.of(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 45)));
        // 45 of this entry + 60 from other days = 105 spent; without the exclusion the form would see 15 left.
        when(entryRepository.sumAdjustmentMinutesInPeriod(anyLong(), any(), any(), eq(77L))).thenReturn(60L);
        when(entryRepository.sumAdjustmentMinutesInPeriod(anyLong(), any(), any(), isNull())).thenReturn(105L);
        assertEquals(60, service.getTimeAdjustmentContext(PAST, u.user().getEmail()).adjustmentMinutesUsed());
    }

    @Test
    void aNewOrChangedOffStepDurationIsRejectedOnSave_anUnchangedLegacyOneIsNot() {
        DailyLogUser u = everyDailyLogUser().get(0);
        when(userRepository.findByEmailAndDeletedAtIsNull(u.user().getEmail())).thenReturn(Optional.of(u.user()));
        // no stored adjustment: 20 minutes is new
        when(entryRepository.findByEmployeeIdAndEntryDate(u.user().getId(), PAST))
                .thenReturn(Optional.of(plainEntry(u, EodEntry.DayType.WORKING_DAY, null, null)));
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.saveDraft(draft(EodEntry.DayType.WORKING_DAY, LATE, 20), u.user().getEmail()));
        assertTrue(ex.getReason().contains("multiple of 15 minutes"), ex.getReason());
        // stored legacy 20: saving 20 again is fine, changing it to 25 is not
        when(entryRepository.findByEmployeeIdAndEntryDate(u.user().getId(), PAST))
                .thenReturn(Optional.of(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 20)));
        assertDoesNotThrow(() -> service.saveDraft(draft(EodEntry.DayType.WORKING_DAY, LATE, 20), u.user().getEmail()));
        when(entryRepository.findByEmployeeIdAndEntryDate(u.user().getId(), PAST))
                .thenReturn(Optional.of(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 20)));
        assertThrows(ResponseStatusException.class,
                () -> service.saveDraft(draft(EodEntry.DayType.WORKING_DAY, LATE, 25), u.user().getEmail()));
    }

    @Test
    void theMonthlyPoolIsSharedAndDeductedFromWhatTheMonthAlreadyUsed() {
        // 90 of 120 minutes already spent this month (by submitted/approved entries of any form).
        when(entryRepository.sumAdjustmentMinutesInPeriod(anyLong(), any(), any(), any())).thenReturn(90L);
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u, "7.0");
            ResponseStatusException ex = rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 60), u.user());
            assertTrue(ex.getReason().contains("exceeds your monthly time adjustment budget"), ex.getReason());
            persistedLines(u, "7.5"); // 30 minutes still fits the pool; bench then needs 8.0 - 0.5
            assertDoesNotThrow(() -> submitChecks(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 30), u.user()));
        }
    }

    @Test
    void noShiftMeansNoAdjustment() {
        AppUser noShift = user(4L, AppUser.Role.ADMIN, false);
        DailyLogUser u = new DailyLogUser(noShift, false);
        persistedLines(u, "5.0");
        ResponseStatusException ex = rejected(plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 60), noShift);
        assertTrue(ex.getReason().contains("needs an assigned shift"), ex.getReason());
    }

    @Test
    void anAdjustmentOnAZeroHoursEntryIsRejected_theLeaveDayMarker() {
        for (DailyLogUser u : everyDailyLogUser()) {
            persistedLines(u);
            EodEntry marker = plainEntry(u, EodEntry.DayType.WORKING_DAY, LATE, 60);
            marker.setLogTotalHours(BigDecimal.ZERO);
            assertTrue(rejected(marker, u.user()).getReason().contains("needs hours logged"));
        }
    }

    // ── save: persisted for every Daily Log user, cleared off a Working day ──────

    private SaveEodRequest draft(EodEntry.DayType dayType, EodEntry.TimeAdjustmentType type, Integer mins) {
        return new SaveEodRequest(PAST, dayType, type, mins, "Office", null, "plan", null,
                List.of(), List.of(), EodEntry.EntryForm.PLAIN_LOG, List.of(), null, null, null);
    }

    private void existingDraft(DailyLogUser u) {
        when(userRepository.findByEmailAndDeletedAtIsNull(u.user().getEmail())).thenReturn(Optional.of(u.user()));
        when(entryRepository.findByEmployeeIdAndEntryDate(u.user().getId(), PAST))
                .thenReturn(Optional.of(plainEntry(u, EodEntry.DayType.WORKING_DAY, null, null)));
    }

    @Test
    void theDraftPersistsTheAdjustmentForBenchPmAndAdmin() {
        for (DailyLogUser u : everyDailyLogUser()) {
            existingDraft(u);
            EodEntryDto saved = service.saveDraft(draft(EodEntry.DayType.WORKING_DAY, LATE, 60), u.user().getEmail());
            assertEquals("LATE_ARRIVAL", saved.timeAdjustmentType());
            assertEquals(60, saved.timeAdjustmentMinutes());
        }
    }

    @Test
    void theDraftClearsAnAdjustmentWhenTheDayIsNotAWorkingDay() {
        for (DailyLogUser u : everyDailyLogUser()) {
            for (EodEntry.DayType t : List.of(EodEntry.DayType.LEAVE, EodEntry.DayType.HOLIDAY,
                    EodEntry.DayType.FIRST_HALF_LEAVE, EodEntry.DayType.SECOND_HALF_LEAVE)) {
                existingDraft(u);
                EodEntryDto saved = service.saveDraft(draft(t, LATE, 60), u.user().getEmail());
                assertNull(saved.timeAdjustmentType(), u.user().getRole() + " " + t);
                assertNull(saved.timeAdjustmentMinutes());
            }
        }
    }

    @Test
    void theDraftNeverStoresAnAdjustmentOnAnEntryItWasNotAskedToHave() {
        DailyLogUser u = everyDailyLogUser().get(0);
        existingDraft(u);
        EodEntryDto saved = service.saveDraft(draft(EodEntry.DayType.WORKING_DAY, null, null), u.user().getEmail());
        assertNull(saved.timeAdjustmentType());
    }

    // ── regression: an allocated employee on the task form ───────────────────────

    private EodEntry taskEntry(AppUser owner, String taskHours, EodEntry.TimeAdjustmentType type, Integer mins) {
        EodEntry e = new EodEntry();
        e.setId(88L);
        e.setEmployee(owner);
        e.setEntryDate(PAST);
        e.setStatus(EodEntry.Status.DRAFT);
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        e.setDayType(EodEntry.DayType.WORKING_DAY);
        e.setTimeAdjustmentType(type);
        e.setTimeAdjustmentMinutes(mins);
        EodTask t = new EodTask();
        t.setEodEntry(e);
        t.setHours(new BigDecimal(taskHours));
        e.setTasks(new ArrayList<>(List.of(t)));
        return e;
    }

    @Test
    void allocatedEmployee_adjustmentStillValidatedAndOvertimeStillCountsItInTheReference() {
        AppUser allocated = user(5L, AppUser.Role.EMPLOYEE, true);
        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(
                service, "validateTimeAdjustment", taskEntry(allocated, "7.0", LATE, 60), allocated));
        assertThrows(ResponseStatusException.class, () -> ReflectionTestUtils.invokeMethod(
                service, "validateTimeAdjustment", taskEntry(allocated, "7.0", LATE, 150), allocated));
        // no minimum any more: 15 minutes is a valid adjustment
        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(
                service, "validateTimeAdjustment", taskEntry(allocated, "7.0", LATE, 15), allocated));

        // 9h of tasks with a 1h adjustment: reference is 8 + 1 = 9, so no overtime; 10h is 1h over.
        EodEntry nine = taskEntry(allocated, "9.0", LATE, 60);
        ReflectionTestUtils.invokeMethod(service, "applyOvertime", nine, allocated);
        assertFalse(Boolean.TRUE.equals(nine.getIsOvertime()));
        EodEntry ten = taskEntry(allocated, "10.0", LATE, 60);
        ReflectionTestUtils.invokeMethod(service, "applyOvertime", ten, allocated);
        assertTrue(ten.getIsOvertime());
        assertEquals(0, new BigDecimal("1.00").compareTo(ten.getOvertimeHours()));
    }

    @Test
    void allocatedEmployee_taskDraftStillPersistsAndClearsTheAdjustment() {
        AppUser allocated = user(5L, AppUser.Role.EMPLOYEE, true);
        when(userRepository.findByEmailAndDeletedAtIsNull(allocated.getEmail())).thenReturn(Optional.of(allocated));
        when(entryRepository.findByEmployeeIdAndEntryDate(5L, PAST))
                .thenReturn(Optional.of(taskEntry(allocated, "8.0", null, null)));
        SaveEodRequest working = new SaveEodRequest(PAST, EodEntry.DayType.WORKING_DAY, LATE, 60, "Office", null,
                "plan", null, List.of(), List.of(), EodEntry.EntryForm.PROJECT_GROUPED, null, null, null, null);
        assertEquals(60, service.saveDraft(working, allocated.getEmail()).timeAdjustmentMinutes());
        SaveEodRequest leave = new SaveEodRequest(PAST, EodEntry.DayType.LEAVE, LATE, 60, null, null,
                "plan", null, List.of(), List.of(), EodEntry.EntryForm.PROJECT_GROUPED, null, null, null, null);
        assertNull(service.saveDraft(leave, allocated.getEmail()).timeAdjustmentType());
    }

    // ── routing: which form a user is given ──────────────────────────────────────

    private String eodFormFor(AppUser u) {
        AuthController auth = new AuthController(null, null, null, null, null, null, null, null,
                allocationRepository, null, null, policy);
        return ReflectionTestUtils.invokeMethod(auth, "computeEodForm", u);
    }

    @Test
    void pmOrAdminAllocatedOnlyToANonActiveProjectGetsTheDailyLogNotSubmitEod() {
        when(allocationRepository.findEmployeeIdsAllocatedOn(anyList(), any())).thenReturn(Set.of(2L, 3L));
        when(allocationRepository.existsActiveProjectAllocationOn(anyLong(), any())).thenReturn(false);
        assertEquals("PLAIN_LOG", eodFormFor(user(2L, AppUser.Role.PM, true)));
        assertEquals("PLAIN_LOG", eodFormFor(user(3L, AppUser.Role.ADMIN, true)));
    }

    @Test
    void pmOrAdminOnAnActiveProjectStillGetsSubmitEod() {
        when(allocationRepository.existsActiveProjectAllocationOn(anyLong(), any())).thenReturn(true);
        assertEquals("PROJECT_GROUPED", eodFormFor(user(2L, AppUser.Role.PM, true)));
        assertEquals("PROJECT_GROUPED", eodFormFor(user(3L, AppUser.Role.ADMIN, true)));
    }

    @Test
    void theServerRefusesTheProjectFormToAPmWhoseOnlyAllocationIsNotActive() {
        when(allocationRepository.findEmployeeIdsAllocatedOn(anyList(), any())).thenReturn(Set.of(2L));
        when(allocationRepository.existsActiveProjectAllocationOn(anyLong(), any())).thenReturn(false);
        AppUser pm = user(2L, AppUser.Role.PM, true);
        when(userRepository.findByEmailAndDeletedAtIsNull(pm.getEmail())).thenReturn(Optional.of(pm));
        when(entryRepository.findByEmployeeIdAndEntryDate(pm.getId(), PAST)).thenReturn(Optional.empty());
        SaveEodRequest projectForm = new SaveEodRequest(PAST, EodEntry.DayType.WORKING_DAY, null, null, "Office",
                null, "plan", null, List.of(), List.of(), EodEntry.EntryForm.PROJECT_GROUPED, null, null, null, null);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.saveDraft(projectForm, pm.getEmail()));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }
}
