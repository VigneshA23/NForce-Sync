package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuthController;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.TaskCategory;
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
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * The Daily Log "Describe what you worked on" rule is the same for every user of that form: required,
 * 3–4000 characters after trim. These tests lock that in for a PM, an Admin and a Reporting Manager (a derived
 * state — someone with a direct report — not a role: AppUser.Role has no MANAGER), and pin which form each
 * kind of user is routed to. Nothing here consults the role, which is exactly the point.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlainLogDescriptionRoleTest {

    private static final LocalDate PAST = LocalDate.of(2026, 10, 9); // a Friday, always in the past

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock AllocationRepository allocationRepository;

    private EodService service;

    @BeforeEach
    void setUp() {
        service = new EodService(entryRepository, null, userRepository, null, null, null,
                null, null, null, null, null, null, null, null, null, allocationRepository,
                null, logLineRepository);
    }

    // ── users ─────────────────────────────────────────────────────────────────

    private static AppUser user(long id, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        return u;
    }

    private static AppUser withManager(AppUser u) {
        u.setManager(user(900L, AppUser.Role.ADMIN));
        return u;
    }

    private static AppUser pm()    { return withManager(user(1L, AppUser.Role.PM)); }
    private static AppUser admin() { return withManager(user(2L, AppUser.Role.ADMIN)); }

    /** A Reporting Manager: a PM with a direct report. Being one changes nothing about the rule. */
    private static AppUser reportingManager() {
        AppUser rm = withManager(user(3L, AppUser.Role.PM));
        AppUser report = user(50L, AppUser.Role.EMPLOYEE);
        report.setManager(rm);
        return rm;
    }

    private List<AppUser> everyDailyLogUser() {
        return List.of(pm(), admin(), reportingManager());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private EodEntry plainEntry(AppUser owner) {
        EodEntry e = new EodEntry();
        e.setId(77L);
        e.setEmployee(owner);
        e.setEntryDate(PAST);
        e.setStatus(EodEntry.Status.DRAFT);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setDayType(EodEntry.DayType.WORKING_DAY);
        e.setWorkLocation("Office");
        e.setNextDayPlan("Plan");
        return e;
    }

    private void persistedLine(String description) {
        TaskCategory c = new TaskCategory();
        c.setId(5L);
        EodLogLine line = new EodLogLine();
        line.setCategory(c);
        line.setHours(new BigDecimal("2.00"));
        line.setDescription(description);
        line.setSortOrder(0);
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(77L)).thenReturn(List.of(line));
    }

    private ResponseStatusException submitRejected(AppUser owner, String description) {
        EodEntry entry = plainEntry(owner);
        persistedLine(description);
        when(userRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(owner));
        when(entryRepository.findWithDetailsById(77L)).thenReturn(Optional.of(entry));
        return assertThrows(ResponseStatusException.class, () -> service.submit(77L, "x@y.z"));
    }

    private void assertValidates(AppUser owner, String description) {
        persistedLine(description);
        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(service, "validatePlainLog", plainEntry(owner)));
    }

    // ── submit: the same rule for every Daily Log user, straight through the API ─

    @Test
    void emptyDescription_isRejectedOnSubmit_forPmAdminAndReportingManager() {
        for (AppUser u : everyDailyLogUser()) {
            ResponseStatusException ex = submitRejected(u, "");
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode(), u.getRole().name());
            assertEquals("Row 1: description is required.", ex.getReason());
        }
    }

    @Test
    void whitespaceOnlyDescription_isRejectedOnSubmit_forPmAdminAndReportingManager() {
        for (AppUser u : everyDailyLogUser()) {
            ResponseStatusException ex = submitRejected(u, "   \t  ");
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertEquals("Row 1: description is required.", ex.getReason());
        }
    }

    @Test
    void twoCharacterDescription_isRejectedOnSubmit_forPmAdminAndReportingManager() {
        for (AppUser u : everyDailyLogUser()) {
            ResponseStatusException ex = submitRejected(u, "ab");
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertEquals("Row 1: description must be at least 3 characters.", ex.getReason());
        }
        // Trimmed length is what counts.
        assertEquals("Row 1: description must be at least 3 characters.", submitRejected(pm(), "  ab  ").getReason());
    }

    @Test
    void threeCharacterDescription_isAccepted_forPmAdminAndReportingManager() {
        for (AppUser u : everyDailyLogUser()) {
            assertValidates(u, "abc");
            assertValidates(u, "  abc  ");
        }
    }

    // ── which form each user lands on, and that an EMPLOYEE can never use Daily Log ─

    private String eodFormFor(AppUser u) {
        AuthController auth = new AuthController(null, null, null, null, null, null, null, null,
                allocationRepository, null, null);
        return ReflectionTestUtils.invokeMethod(auth, "computeEodForm", u);
    }

    private void allocatedToday(boolean allocated) {
        when(allocationRepository.findEmployeeIdsAllocatedOn(anyList(), any()))
                .thenReturn(allocated ? Set.of(1L, 2L, 3L) : Set.of());
    }

    @Test
    void pmAndAdminWithManagerAndNoAllocation_getDailyLog() {
        allocatedToday(false);
        assertEquals("PLAIN_LOG", eodFormFor(pm()));
        assertEquals("PLAIN_LOG", eodFormFor(admin()));
        assertEquals("PLAIN_LOG", eodFormFor(reportingManager()));
    }

    @Test
    void pmAndAdminWithAnActiveAllocation_getTheProjectGroupedForm() {
        allocatedToday(true);
        assertEquals("PROJECT_GROUPED", eodFormFor(pm()));
        assertEquals("PROJECT_GROUPED", eodFormFor(admin()));
    }

    @Test
    void topLevelUserWithNoReportingManager_getsNoForm() {
        allocatedToday(false);
        assertNull(eodFormFor(user(9L, AppUser.Role.SUPERADMIN)));
    }

    @Test
    void employeeWithDirectReports_stillGetsProjectGrouped_whateverTheirAllocation() {
        AppUser employeeWhoManagesSomeone = withManager(user(4L, AppUser.Role.EMPLOYEE));
        AppUser report = user(51L, AppUser.Role.EMPLOYEE);
        report.setManager(employeeWhoManagesSomeone);
        allocatedToday(false);
        assertEquals("PROJECT_GROUPED", eodFormFor(employeeWhoManagesSomeone));
        allocatedToday(true);
        assertEquals("PROJECT_GROUPED", eodFormFor(employeeWhoManagesSomeone));
    }

    @Test
    void backendRejectsADailyLogDraftFromAnEmployee_evenOneWithDirectReports() {
        AppUser employeeWhoManagesSomeone = withManager(user(4L, AppUser.Role.EMPLOYEE));
        AppUser report = user(51L, AppUser.Role.EMPLOYEE);
        report.setManager(employeeWhoManagesSomeone);
        when(userRepository.findByEmailAndDeletedAtIsNull(anyString())).thenReturn(Optional.of(employeeWhoManagesSomeone));
        when(entryRepository.findByEmployeeIdAndEntryDate(any(), any())).thenReturn(Optional.empty());

        SaveEodRequest req = new SaveEodRequest(PAST, EodEntry.DayType.WORKING_DAY, null, null, "Office",
                null, "plan", null, List.of(), List.of(), EodEntry.EntryForm.PLAIN_LOG, null, null, null, null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.saveDraft(req, "e@y.z"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("project-grouped"));
    }
}
