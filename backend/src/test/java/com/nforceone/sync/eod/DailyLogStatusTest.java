package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.EodLogLineDto;
import com.nforceone.sync.eod.dto.SaveEodLogLineRequest;
import com.nforceone.sync.eod.dto.SaveEodRequest;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.project.TaskCategory;
import com.nforceone.sync.project.TaskCategoryRepository;
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
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Status and Blocker on the Daily Log (PLAIN_LOG): a Status on every line at submit (drafts may leave it empty),
 * a reason when Blocked, a reporting manager to receive the blocker, and a blocker's thread / Acknowledge / Resolve
 * markers surviving the entry being saved again. For the three kinds of Daily Log user — an employee on the bench,
 * and a PM or Admin with no active project.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DailyLogStatusTest {

    private static final LocalDate PAST = LocalDate.of(2026, 10, 9); // a Friday, always in the past

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock ReportingScopeService reportingScope;
    @Mock ProjectRepository projectRepository;
    @Mock TaskCategoryRepository categoryRepository;
    @Mock EodAttachmentService attachmentService;

    private EodService service;
    private TaskCategory benchCategory;
    private TaskCategory managementCategory;

    @BeforeEach
    void setUp() {
        BenchModePolicy policy = new BenchModePolicy(allocationRepository, reportingScope, projectRepository);
        service = new EodService(entryRepository, null, userRepository, null, categoryRepository, null,
                null, null, null, attachmentService, null, null, null, null, null,
                allocationRepository, null, logLineRepository, policy);
        benchCategory = category(5L, "BENCH");
        managementCategory = category(6L, "MANAGEMENT");
        when(categoryRepository.findById(5L)).thenReturn(Optional.of(benchCategory));
        when(categoryRepository.findById(6L)).thenReturn(Optional.of(managementCategory));
        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(logLineRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(attachmentService.loadForEntries(anyList()))
                .thenReturn(new EodAttachmentService.AttachmentsByScope(Map.of(), Map.of()));
    }

    private static TaskCategory category(Long id, String scope) {
        TaskCategory c = new TaskCategory();
        c.setId(id);
        c.setName("Cat" + id);
        c.setScope(scope);
        c.setActive(true);
        return c;
    }

    // ── the three Daily Log users ────────────────────────────────────────────────

    private record DailyLogUser(AppUser user, boolean bench) {
        long categoryId() { return bench ? 5L : 6L; }
    }

    private static AppUser user(long id, AppUser.Role role, boolean withManager) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        u.setEmail("u" + id + "@example.com");
        if (withManager) {
            AppUser mgr = new AppUser();
            mgr.setId(900L);
            u.setManager(mgr);
        }
        return u;
    }

    private List<DailyLogUser> everyDailyLogUser() {
        return List.of(
                new DailyLogUser(user(1L, AppUser.Role.EMPLOYEE, true), true),
                new DailyLogUser(user(2L, AppUser.Role.PM, true), false),
                new DailyLogUser(user(3L, AppUser.Role.ADMIN, true), false));
    }

    private EodEntry plainEntry(DailyLogUser u) {
        EodEntry e = new EodEntry();
        e.setId(77L);
        e.setEmployee(u.user());
        e.setEntryDate(PAST);
        e.setStatus(EodEntry.Status.DRAFT);
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setBenchMode(u.bench());
        e.setDayType(EodEntry.DayType.WORKING_DAY);
        e.setWorkLocation("Office");
        e.setNextDayPlan("Plan");
        return e;
    }

    private EodLogLine line(DailyLogUser u, long id, String hours, EodTask.TaskStatus status, String reason) {
        EodLogLine l = new EodLogLine();
        l.setId(id);
        l.setCategory(u.bench() ? benchCategory : managementCategory);
        l.setHours(new BigDecimal(hours));
        l.setDescription("worked on something");
        l.setSortOrder((int) id);
        l.setTaskStatus(status);
        l.setBlockerReason(reason);
        return l;
    }

    private void persisted(DailyLogUser u, EodLogLine... lines) {
        for (EodLogLine l : lines) l.setEntry(plainEntry(u));
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(77L)).thenReturn(new ArrayList<>(List.of(lines)));
    }

    private void submitChecks(EodEntry e) {
        ReflectionTestUtils.invokeMethod(service, "validatePlainLog", e);
    }

    private ResponseStatusException rejected(EodEntry e) {
        return assertThrows(ResponseStatusException.class, () -> submitChecks(e));
    }

    // ── submit: a Status on every line ───────────────────────────────────────────

    @Test
    void submitRequiresAStatusOnEveryLine() {
        for (DailyLogUser u : everyDailyLogUser()) {
            persisted(u, line(u, 1, "8.0", null, null));
            // Only the bench is held to 8.0, and 8.0 is what we give it — so the status is what is missing.
            ResponseStatusException ex = rejected(plainEntry(u));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertEquals("Row 1: status is required.", ex.getReason());
        }
    }

    @Test
    void theSecondLineNamesItsOwnRow() {
        DailyLogUser u = everyDailyLogUser().get(0);
        persisted(u, line(u, 1, "4.0", EodTask.TaskStatus.COMPLETED, null), line(u, 2, "4.0", null, null));
        assertEquals("Row 2: status is required.", rejected(plainEntry(u)).getReason());
    }

    @Test
    void everyOneOfTheFourStatusesIsAccepted() {
        DailyLogUser u = everyDailyLogUser().get(1);   // PM: no hours target in the way
        for (EodTask.TaskStatus s : EodTask.TaskStatus.values()) {
            persisted(u, line(u, 1, "5.0", s, s == EodTask.TaskStatus.BLOCKED ? "Waiting on access" : null));
            assertDoesNotThrow(() -> submitChecks(plainEntry(u)), s.name());
        }
    }

    @Test
    void blockedNeedsAReason_butOnlyBlocked() {
        for (DailyLogUser u : everyDailyLogUser()) {
            persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.BLOCKED, null));
            assertEquals("Row 1: blocker reason is required when status is Blocked.", rejected(plainEntry(u)).getReason());
            persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.BLOCKED, "   "));
            assertEquals("Row 1: blocker reason is required when status is Blocked.", rejected(plainEntry(u)).getReason());
            persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.BLOCKED, "x".repeat(301)));
            assertTrue(rejected(plainEntry(u)).getReason().contains("300 characters or fewer"));
            persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.BLOCKED, "Waiting on access"));
            assertDoesNotThrow(() -> submitChecks(plainEntry(u)));
            persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.IN_PROGRESS, null));
            assertDoesNotThrow(() -> submitChecks(plainEntry(u)));
        }
    }

    // ── no reporting manager: block only a Blocked line, and only at submit ──────

    @Test
    void aBlockedLineCannotBeSubmittedWithoutAReportingManager() {
        for (DailyLogUser withManager : everyDailyLogUser()) {
            DailyLogUser u = new DailyLogUser(user(withManager.user().getId() + 10, withManager.user().getRole(), false),
                    withManager.bench());
            persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.BLOCKED, "Waiting on access"));
            ResponseStatusException ex = rejected(plainEntry(u));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertEquals("You have no reporting manager assigned to receive this blocker. Contact your administrator.",
                    ex.getReason());
        }
    }

    @Test
    void nonBlockedLinesStillSubmitWithoutAReportingManager() {
        DailyLogUser u = new DailyLogUser(user(21L, AppUser.Role.EMPLOYEE, false), true);
        persisted(u, line(u, 1, "8.0", EodTask.TaskStatus.COMPLETED, null));
        assertDoesNotThrow(() -> submitChecks(plainEntry(u)));
    }

    @Test
    void aDraftWithABlockedLineSavesEvenWithoutAReportingManager() {
        DailyLogUser u = new DailyLogUser(user(21L, AppUser.Role.EMPLOYEE, false), true);
        existingDraft(u, List.of());
        service.saveDraft(draft(u, new SaveEodLogLineRequest(5L, new BigDecimal("2.0"), "stuck",
                0, null, EodTask.TaskStatus.BLOCKED, "Waiting on access")), u.user().getEmail());
        org.mockito.ArgumentCaptor<EodLogLine> stored = org.mockito.ArgumentCaptor.forClass(EodLogLine.class);
        verify(logLineRepository).save(stored.capture());
        assertEquals(EodTask.TaskStatus.BLOCKED, stored.getValue().getTaskStatus());
    }

    // ── drafts: status optional, reason kept only while Blocked ──────────────────

    private void existingDraft(DailyLogUser u, List<EodLogLine> existing) {
        when(userRepository.findByEmailAndDeletedAtIsNull(u.user().getEmail())).thenReturn(Optional.of(u.user()));
        when(entryRepository.findByEmployeeIdAndEntryDate(u.user().getId(), PAST)).thenReturn(Optional.of(plainEntry(u)));
        existing.forEach(l -> l.setEntry(plainEntry(u)));
        // What the service reads before saving, and what the response is built from afterwards.
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(77L)).thenReturn(new ArrayList<>(existing));
    }

    private SaveEodRequest draft(DailyLogUser u, SaveEodLogLineRequest... lines) {
        return new SaveEodRequest(PAST, EodEntry.DayType.WORKING_DAY, null, null, "Office", null, "plan", null,
                List.of(), List.of(), EodEntry.EntryForm.PLAIN_LOG, List.of(lines), null, null, null);
    }

    private SaveEodLogLineRequest req(DailyLogUser u, Long id, EodTask.TaskStatus status, String reason) {
        return new SaveEodLogLineRequest(u.categoryId(), new BigDecimal("2.0"), "worked", 0, id, status, reason);
    }

    @Test
    void aDraftMayLeaveTheStatusEmpty_forEveryDailyLogUser() {
        for (DailyLogUser u : everyDailyLogUser()) {
            existingDraft(u, List.of());
            org.mockito.ArgumentCaptor<EodLogLine> saved = org.mockito.ArgumentCaptor.forClass(EodLogLine.class);
            service.saveDraft(draft(u, req(u, null, null, null)), u.user().getEmail());
            verify(logLineRepository, org.mockito.Mockito.atLeastOnce()).save(saved.capture());
            assertNull(saved.getValue().getTaskStatus(), u.user().getRole() + " draft keeps the status empty");
            org.mockito.Mockito.clearInvocations(logLineRepository);
        }
    }

    @Test
    void aDraftStoresTheStatusAndKeepsTheReasonOnlyWhileBlocked() {
        DailyLogUser u = everyDailyLogUser().get(0);
        existingDraft(u, List.of());
        org.mockito.ArgumentCaptor<EodLogLine> saved = org.mockito.ArgumentCaptor.forClass(EodLogLine.class);

        service.saveDraft(draft(u, req(u, null, EodTask.TaskStatus.BLOCKED, "  Waiting on access  ")), u.user().getEmail());
        verify(logLineRepository).save(saved.capture());
        assertEquals(EodTask.TaskStatus.BLOCKED, saved.getValue().getTaskStatus());
        assertEquals("Waiting on access", saved.getValue().getBlockerReason());

        existingDraft(u, List.of());
        org.mockito.ArgumentCaptor<EodLogLine> notBlocked = org.mockito.ArgumentCaptor.forClass(EodLogLine.class);
        service.saveDraft(draft(u, req(u, null, EodTask.TaskStatus.IN_PROGRESS, "left over text")), u.user().getEmail());
        verify(logLineRepository, org.mockito.Mockito.times(2)).save(notBlocked.capture());
        assertEquals(EodTask.TaskStatus.IN_PROGRESS, notBlocked.getValue().getTaskStatus());
        assertNull(notBlocked.getValue().getBlockerReason(), "the reason is dropped once the line is not Blocked");
    }

    // ── saving a rejected entry again keeps the blocker (replies, read state, markers) ──

    private EodLogLine blockedWithMarkers(DailyLogUser u, long id) {
        EodLogLine l = line(u, id, "2.0", EodTask.TaskStatus.BLOCKED, "Waiting on access");
        AppUser rm = user(900L, AppUser.Role.ADMIN, true);
        l.setAcknowledgedAt(OffsetDateTime.now().minusDays(1));
        l.setAcknowledgedBy(rm);
        return l;
    }

    @Test
    void aLineSentBackWithItsIdIsUpdatedInPlace_soItsBlockerStateSurvives() {
        DailyLogUser u = everyDailyLogUser().get(0);
        EodLogLine old = blockedWithMarkers(u, 10);
        existingDraft(u, List.of(old));
        when(logLineRepository.hasBlockerReplies(10L)).thenReturn(true);

        service.saveDraft(draft(u, new SaveEodLogLineRequest(5L, new BigDecimal("3.0"), "edited description", 0, 10L,
                EodTask.TaskStatus.BLOCKED, "Still waiting")), u.user().getEmail());

        org.mockito.ArgumentCaptor<EodLogLine> saved = org.mockito.ArgumentCaptor.forClass(EodLogLine.class);
        verify(logLineRepository).save(saved.capture());
        assertSame(old, saved.getValue(), "the same row, not a recreated one");
        assertEquals(10L, saved.getValue().getId());
        assertEquals("edited description", saved.getValue().getDescription());
        assertNotNull(saved.getValue().getAcknowledgedAt(), "the Acknowledge marker is kept");
        assertEquals("ACKNOWLEDGED", saved.getValue().getBlockerStatus());
        verify(logLineRepository, never()).delete(any());
    }

    @Test
    void aLineThatBecomesBlockedIsAFreshBlocker_soOldMarkersAreCleared() {
        DailyLogUser u = everyDailyLogUser().get(0);
        EodLogLine old = line(u, 10, "2.0", EodTask.TaskStatus.COMPLETED, null);
        old.setResolvedAt(OffsetDateTime.now().minusDays(2));
        old.setAcknowledgedAt(OffsetDateTime.now().minusDays(2));
        existingDraft(u, List.of(old));

        service.saveDraft(draft(u, req(u, 10L, EodTask.TaskStatus.BLOCKED, "Blocked again")), u.user().getEmail());

        assertNull(old.getResolvedAt());
        assertNull(old.getAcknowledgedAt());
    }

    @Test
    void aSavedLineNoLongerSentIsRemoved_unlessItsBlockerHasReplies() {
        DailyLogUser u = everyDailyLogUser().get(0);
        EodLogLine keep = line(u, 10, "2.0", EodTask.TaskStatus.COMPLETED, null);
        EodLogLine gone = line(u, 11, "2.0", EodTask.TaskStatus.COMPLETED, null);
        existingDraft(u, List.of(keep, gone));
        service.saveDraft(draft(u, req(u, 10L, EodTask.TaskStatus.COMPLETED, null)), u.user().getEmail());
        verify(logLineRepository).delete(gone);
        verify(logLineRepository, never()).delete(keep);

        // A line whose blocker already has a conversation cannot be dropped silently.
        EodLogLine replied = blockedWithMarkers(u, 12);
        existingDraft(u, List.of(replied));
        when(logLineRepository.hasBlockerReplies(12L)).thenReturn(true);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.saveDraft(draft(u, req(u, null, EodTask.TaskStatus.COMPLETED, null)), u.user().getEmail()));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("blocker conversation"), ex.getReason());
        assertEquals(12L, ((BlockerLineLockedException) ex).getLineId(), "the form is told which line");
        verify(logLineRepository, never()).delete(replied);
    }

    @Test
    void theResponseCarriesTheStatusAndReasonBack() {
        EodLogLine l = line(everyDailyLogUser().get(0), 10, "2.0", EodTask.TaskStatus.BLOCKED, "Waiting on access");
        l.setCategory(benchCategory);
        EodLogLineDto dto = EodLogLineDto.from(l);
        assertEquals("BLOCKED", dto.taskStatus());
        assertEquals("Waiting on access", dto.blockerReason());
        EodLogLine old = line(everyDailyLogUser().get(0), 11, "1.0", null, null);
        assertNull(EodLogLineDto.from(old).taskStatus(), "a line from before V118 has no status");
    }
}
