package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.eod.BlockerReplyRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.notification.NotificationService;
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
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * The reporting manager's side of a lead's OWN blocker: who is listed, and the explicit rule for who
 * may acknowledge / resolve. Acknowledge and resolve for an ordinary blocker stay with that project's
 * lead; the RM gets them only for blockers its author raised on a project the author leads himself.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TeamLeadServiceBlockerRmTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 12);
    private static final LocalDate SUNDAY = LocalDate.of(2026, 10, 11);

    @Mock AppUserRepository userRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock BlockerReplyRepository replyRepository;
    @Mock NotificationService notificationService;
    @Mock ProjectRepository projectRepository;

    private TeamLeadService service;

    private AppUser vignesh;   // employee + lead of SYNC
    private AppUser dheeraj;   // vignesh's frozen RM (and akhila's)
    private AppUser otherRm;   // an unrelated RM
    private AppUser akhila;    // ordinary employee on SYNC
    private AppUser nobody;    // neither lead nor RM
    private Project sync;
    private EodTask leadsOwn;  // vignesh's blocker on SYNC (he leads it)
    private EodTask ordinary;  // akhila's blocker on SYNC (vignesh leads it; dheeraj is only her RM)

    @BeforeEach
    void setUp() {
        service = new TeamLeadService(userRepository, null, taskRepository, null, null, null,
                null, null, replyRepository, notificationService, null, projectRepository,
                new LeadTeamPolicy(null, null, null), (Executor) Runnable::run);

        vignesh = user(1L, "Vignesh A");
        dheeraj = user(2L, "Dheeraj S");
        otherRm = user(3L, "Other Rm");
        akhila  = user(4L, "Akhila S");
        nobody  = user(5L, "No Role");
        for (AppUser u : List.of(vignesh, dheeraj, otherRm, akhila, nobody)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        when(projectRepository.existsByLeadIdAndStatus(vignesh.getId(), Project.Status.ACTIVE)).thenReturn(true);
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(dheeraj.getId())).thenReturn(true);
        when(userRepository.existsByManagerIdAndDeletedAtIsNull(otherRm.getId())).thenReturn(true);

        sync = new Project();
        sync.setId(10L);
        sync.setCode("SYNC");
        sync.setName("Nforce Sync");
        sync.setLead(vignesh);

        leadsOwn = blocker(50L, vignesh);
        ordinary = blocker(51L, akhila);
        for (EodTask t : List.of(leadsOwn, ordinary)) {
            when(taskRepository.findById(t.getId())).thenReturn(Optional.of(t));
        }
        when(taskRepository.save(any(EodTask.class))).thenAnswer(i -> i.getArgument(0));
    }

    private AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setRole(AppUser.Role.EMPLOYEE);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        return u;
    }

    private EodTask blocker(Long taskId, AppUser author) {
        EodEntry e = new EodEntry();
        e.setId(taskId + 1000);
        e.setEmployee(author);
        e.setManagerId(dheeraj.getId());     // both authors report to dheeraj (frozen at submit)
        e.setEntryDate(SUNDAY);
        e.setStatus(EodEntry.Status.SUBMITTED);
        EodTask t = new EodTask();
        t.setId(taskId);
        t.setEodEntry(e);
        t.setProject(sync);
        t.setTaskStatus(EodTask.TaskStatus.BLOCKED);
        t.setBlockerReason("Waiting on access");
        return t;
    }

    private void assertForbidden(org.junit.jupiter.api.function.Executable call) {
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, call).getStatusCode());
    }

    // ── list: strictly the frozen manager's own-lead blockers ─────────────────

    @Test
    void list_isScopedToTheCallingManager_viaTheFrozenManagerQuery() {
        when(taskRepository.findBlockedForReportingManager(eq(dheeraj.getId()), any(), any(), any(), any()))
                .thenReturn(List.of(leadsOwn));
        when(taskRepository.findBlockedForReportingManager(eq(otherRm.getId()), any(), any(), any(), any()))
                .thenReturn(List.of());

        List<TeamBlockerDto> mine = service.getBlockersForReportingManager(TODAY, TODAY, dheeraj.getId(), true);
        List<TeamBlockerDto> theirs = service.getBlockersForReportingManager(TODAY, TODAY, otherRm.getId(), true);

        assertEquals(List.of(50L), mine.stream().map(TeamBlockerDto::taskId).toList());
        assertEquals(SUNDAY, mine.get(0).entryDate(), "a Sunday blocker carries over to Monday's view");
        assertTrue(theirs.isEmpty(), "a different RM gets nothing");
        verify(taskRepository, never()).findBlockedForProjectLead(any(), any(), any(), any(), any());
    }

    @Test
    void detail_onlyTheFrozenManagerOfAnOwnLeadBlocker() {
        assertEquals(50L, service.getBlockerByIdForReportingManager(50L, dheeraj).taskId());
        assertForbidden(() -> service.getBlockerByIdForReportingManager(50L, otherRm));
        // An ordinary blocker (author is not that project's lead) is not on the RM page at all.
        assertForbidden(() -> service.getBlockerByIdForReportingManager(51L, dheeraj));
        // The lead himself is not his own reviewer.
        assertForbidden(() -> service.getBlockerByIdForReportingManager(50L, vignesh));
    }

    // ── acknowledge / resolve: the explicit permission ────────────────────────

    @Test
    void rm_mayAcknowledgeAndResolve_aLeadsOwnBlocker() {
        TeamBlockerDto acked = service.acknowledgeBlocker(50L, dheeraj.getEmail());
        assertEquals("ACKNOWLEDGED", acked.status());
        assertEquals("Dheeraj S", acked.acknowledgedByName());

        TeamBlockerDto resolved = service.setBlockerStatus(50L, dheeraj.getEmail(), new BlockerStatusRequest("RESOLVED"));
        assertEquals("RESOLVED", resolved.status());
        verify(notificationService).send(eq(vignesh.getId()), eq("BLOCKER_RESOLVED"), any(), any(), any());
    }

    @Test
    void rm_mayNotAcknowledgeOrResolve_anOrdinaryProjectLeadBlocker() {
        assertForbidden(() -> service.acknowledgeBlocker(51L, dheeraj.getEmail()));
        assertForbidden(() -> service.setBlockerStatus(51L, dheeraj.getEmail(), new BlockerStatusRequest("RESOLVED")));
        assertNull(ordinary.getAcknowledgedAt());
        assertNull(ordinary.getResolvedAt());
    }

    @Test
    void ordinaryBlocker_stillBelongsToItsProjectLead() {
        assertEquals("ACKNOWLEDGED", service.acknowledgeBlocker(51L, vignesh.getEmail()).status());
        assertEquals("RESOLVED",
                service.setBlockerStatus(51L, vignesh.getEmail(), new BlockerStatusRequest("RESOLVED")).status());
    }

    @Test
    void aDifferentRm_mayNotAcknowledgeOrResolve() {
        assertForbidden(() -> service.acknowledgeBlocker(50L, otherRm.getEmail()));
        assertForbidden(() -> service.setBlockerStatus(50L, otherRm.getEmail(), new BlockerStatusRequest("RESOLVED")));
        assertNull(leadsOwn.getAcknowledgedAt());
    }

    @Test
    void lead_mayNotResolveHisOwnBlocker() {
        assertForbidden(() -> service.setBlockerStatus(50L, vignesh.getEmail(), new BlockerStatusRequest("RESOLVED")));
        assertForbidden(() -> service.setBlockerStatus(50L, vignesh.getEmail(), new BlockerStatusRequest("ACKNOWLEDGED")));
        assertNull(leadsOwn.getResolvedAt());
        assertNull(leadsOwn.getAcknowledgedAt());
    }

    @Test
    void someoneWhoIsNeitherLeadNorManager_isRejectedUpFront() {
        assertForbidden(() -> service.acknowledgeBlocker(50L, nobody.getEmail()));
        assertForbidden(() -> service.setBlockerStatus(50L, nobody.getEmail(), new BlockerStatusRequest("RESOLVED")));
    }
}
