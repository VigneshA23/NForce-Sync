package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.utilization.UtilizationService;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.eod.BlockerReplyRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.teamlead.dto.BlockerStatusRequest;
import com.nforceone.sync.teamlead.dto.TeamBlockerDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Team Lead blockers are routed by the project each blocker was raised on, not by the author's
 * current allocation. These cover the routing and the guards on detail / acknowledge / resolve, and
 * that the Team Dashboard KPI reads the very same scope as the Blockers page.
 *
 * The carry-over itself (an open blocker returned from its entry date until resolved) lives in the
 * repository query, so here the repository is stubbed to return what that query would; the SQL
 * predicate is not exercised by a unit test.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TeamLeadServiceBlockerRoutingTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 12);
    private static final LocalDate SUNDAY = LocalDate.of(2026, 10, 11);

    @Mock AppUserRepository userRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock UtilizationService utilizationService;
    @Mock BlockerReplyRepository replyRepository;
    @Mock NotificationService notificationService;
    @Mock AllocationRepository allocationRepository;
    @Mock ProjectRepository projectRepository;

    private TeamLeadService service;
    private AppUser lead;        // leads project SYNC
    private AppUser otherLead;   // leads a different project
    private AppUser employee;
    private Project sync;

    @BeforeEach
    void setUp() {
        // Constructor order: userRepo, entryRepo, taskRepo, holidayRepo, configRepo, utilizationService,
        // actionRepo, designationRepo, replyRepo, notificationService, allocationRepo, projectRepo, executor
        service = new TeamLeadService(userRepository, null, taskRepository, holidayRepository, configRepository, utilizationService,
                null, null, replyRepository, notificationService, allocationRepository, projectRepository,
                new LeadTeamPolicy(allocationRepository, projectRepository, null), (Executor) Runnable::run, new com.nforceone.sync.config.BusinessClock(com.nforceone.sync.config.BusinessClock.DEFAULT_ZONE));

        lead      = user(1L, "Vignesh Lead");
        otherLead = user(2L, "Other Lead");
        employee  = user(3L, "Akhila S");
        for (AppUser u : List.of(lead, otherLead, employee)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
            when(projectRepository.existsByLeadIdAndStatus(u.getId(), Project.Status.ACTIVE))
                    .thenReturn(u != employee);
        }
        sync = new Project();
        sync.setId(10L);
        sync.setCode("SYNC");
        sync.setName("Nforce Sync");
        sync.setLead(lead);

        when(configRepository.findById(anyLong())).thenReturn(Optional.of(new BusinessRuleConfig()));
        when(taskRepository.save(any(EodTask.class))).thenAnswer(i -> i.getArgument(0));
    }

    private static long anyLong() { return org.mockito.ArgumentMatchers.anyLong(); }

    private AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setRole(AppUser.Role.EMPLOYEE);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private EodTask blocker(Long taskId, AppUser author, Project project, LocalDate date, boolean acknowledged) {
        EodEntry e = new EodEntry();
        e.setId(taskId + 1000);
        e.setEmployee(author);
        e.setEntryDate(date);
        e.setStatus(EodEntry.Status.SUBMITTED);
        e.setDayType(EodEntry.DayType.WEEKEND);
        e.setWeekendWorked(true);
        EodTask t = new EodTask();
        t.setId(taskId);
        t.setEodEntry(e);
        t.setProject(project);
        t.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        t.setBlockerReason("Waiting on access");
        if (acknowledged) t.setAcknowledgedAt(OffsetDateTime.now());
        return t;
    }

    private void leadQueryReturns(AppUser forLead, EodTask... tasks) {
        when(taskRepository.findBlockedForProjectLead(eq(forLead.getId()), any(), any(), any(), any()))
                .thenReturn(List.of(tasks));
    }

    // ── routing ───────────────────────────────────────────────────────────────

    @Test
    void list_isRoutedByTheBlockersProject_notByAllocation() {
        // A Sunday weekend-worked blocker viewed on Monday ("Today"): the lead's query (which carries
        // open blockers over) returns it, and the allocation team is never consulted — an ended or
        // not-yet-started allocation therefore cannot hide it.
        leadQueryReturns(lead, blocker(50L, employee, sync, SUNDAY, false));

        List<TeamBlockerDto> list = service.getBlockers(TODAY, TODAY, lead.getEmail(), true, null);

        assertEquals(1, list.size());
        assertEquals(SUNDAY, list.get(0).entryDate());
        assertEquals("SYNC", list.get(0).projectCode());
        assertEquals("NEEDS_RESPONSE", list.get(0).status());
        verify(taskRepository, never()).findBlockedByEmployeeIdsInAndDateRange(anyList(), any(), any());
        verify(allocationRepository, never()).findActiveMembersByProjectLead(any(), any());
    }

    @Test
    void list_aLeadOfADifferentProjectSeesNothing() {
        leadQueryReturns(lead, blocker(50L, employee, sync, SUNDAY, false));
        when(taskRepository.findBlockedForProjectLead(eq(otherLead.getId()), any(), any(), any(), any()))
                .thenReturn(List.of());

        assertTrue(service.getBlockers(TODAY, TODAY, otherLead.getEmail(), true, null).isEmpty());
    }

    @Test
    void list_passesTheWindowAsDayBoundsSoResolvedWithinTheWindowCanBeMatched() {
        service.getBlockers(SUNDAY, TODAY, lead.getEmail(), true, null);

        verify(taskRepository).findBlockedForProjectLead(eq(lead.getId()), eq(SUNDAY), eq(TODAY),
                argThat(from -> from.toLocalDate().equals(SUNDAY)),
                argThat(to -> to.toLocalDate().equals(TODAY.plusDays(1)) && to.toLocalTime().equals(java.time.LocalTime.MIDNIGHT)));
    }

    @Test
    void list_dayBoundsAreBusinessZoneMidnights_whateverTheJvmZone() {
        java.util.TimeZone original = java.util.TimeZone.getDefault();
        try {
            for (String jvmZone : List.of("UTC", "Asia/Kolkata", "America/Los_Angeles")) {
                java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone(jvmZone));
                clearInvocations(taskRepository);

                service.getBlockers(SUNDAY, TODAY, lead.getEmail(), true, null);

                // Sunday 00:00 IST is Saturday 18:30 UTC; the end bound is Tuesday 00:00 IST == Monday 18:30 UTC.
                verify(taskRepository).findBlockedForProjectLead(eq(lead.getId()), eq(SUNDAY), eq(TODAY),
                        argThat(from -> from.toInstant().equals(java.time.Instant.parse("2026-10-10T18:30:00Z"))),
                        argThat(to -> to.toInstant().equals(java.time.Instant.parse("2026-10-12T18:30:00Z"))));
            }
        } finally {
            java.util.TimeZone.setDefault(original);
        }
    }

    @Test
    void list_excludesAcknowledgedUnlessAsked() {
        EodTask open  = blocker(50L, employee, sync, SUNDAY, false);
        EodTask acked = blocker(51L, employee, sync, SUNDAY, true);
        leadQueryReturns(lead, open, acked);

        assertEquals(List.of(50L), service.getBlockers(TODAY, TODAY, lead.getEmail(), false, null)
                .stream().map(TeamBlockerDto::taskId).toList());
        assertEquals(2, service.getBlockers(TODAY, TODAY, lead.getEmail(), true, null).size());
    }

    // ── KPI agrees with the page ──────────────────────────────────────────────

    @Test
    void dashboardKpi_countsExactlyWhatTheBlockersPageShowsAsNeedingResponse() {
        leadQueryReturns(lead,
                blocker(50L, employee, sync, SUNDAY, false),   // carried over, needs response
                blocker(51L, employee, sync, TODAY, false),    // raised today, needs response
                blocker(52L, employee, sync, SUNDAY, true));   // acknowledged — open but replied to
        when(allocationRepository.findActiveMembersByProjectLead(eq(lead.getId()), any())).thenReturn(List.of());

        int kpi = service.getSummary(TODAY, TODAY, lead.getEmail(), null).activeBlockersCount();
        long needsResponseOnPage = service.getBlockers(TODAY, TODAY, lead.getEmail(), true, null).stream()
                .filter(b -> "NEEDS_RESPONSE".equals(b.status())).count();

        assertEquals(2, kpi);
        assertEquals(needsResponseOnPage, kpi);
    }

    // ── detail / acknowledge / resolve guards ─────────────────────────────────

    private void taskExists(EodTask t) {
        when(taskRepository.findById(t.getId())).thenReturn(Optional.of(t));
    }

    @Test
    void detail_projectLeadMaySee_otherLeadAndTheAuthorLeadMayNot() {
        EodTask t = blocker(50L, employee, sync, SUNDAY, false);
        taskExists(t);

        assertEquals(50L, service.getBlockerById(50L, lead.getEmail()).taskId());
        ResponseStatusException other = assertThrows(ResponseStatusException.class,
                () -> service.getBlockerById(50L, otherLead.getEmail()));
        assertEquals(HttpStatus.FORBIDDEN, other.getStatusCode());
    }

    @Test
    void aLeadsOwnBlocker_isNotTheirToSeeOnTheLeadPageOrAct_on() {
        // Vignesh leads SYNC and raised a blocker on it himself: no lead page owns it.
        EodTask own = blocker(60L, lead, sync, SUNDAY, false);
        taskExists(own);

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.getBlockerById(60L, lead.getEmail())).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.acknowledgeBlocker(60L, lead.getEmail())).getStatusCode());
    }

    @Test
    void acknowledge_andResolve_workForTheProjectLead_andNotForAnotherLead() {
        EodTask t = blocker(50L, employee, sync, SUNDAY, false);
        taskExists(t);

        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.acknowledgeBlocker(50L, otherLead.getEmail())).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> service.setBlockerStatus(50L, otherLead.getEmail(), new BlockerStatusRequest("RESOLVED")))
                .getStatusCode());
        assertNull(t.getAcknowledgedAt());
        assertNull(t.getResolvedAt());

        TeamBlockerDto acked = service.acknowledgeBlocker(50L, lead.getEmail());
        assertEquals("ACKNOWLEDGED", acked.status());
    }

    @Test
    void resolving_marksItResolved_notifiesTheAuthor_andItIsTerminal() {
        EodTask t = blocker(50L, employee, sync, SUNDAY, false);
        taskExists(t);

        TeamBlockerDto resolved = service.setBlockerStatus(50L, lead.getEmail(), new BlockerStatusRequest("RESOLVED"));

        assertEquals("RESOLVED", resolved.status());
        assertNotNull(t.getResolvedAt());
        assertNotNull(t.getAcknowledgedAt(), "resolved implies acknowledged");
        verify(notificationService).send(eq(employee.getId()), eq("BLOCKER_RESOLVED"), any(), any(), any());
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                () -> service.setBlockerStatus(50L, lead.getEmail(), new BlockerStatusRequest("NEEDS_RESPONSE")))
                .getStatusCode());
    }
}
