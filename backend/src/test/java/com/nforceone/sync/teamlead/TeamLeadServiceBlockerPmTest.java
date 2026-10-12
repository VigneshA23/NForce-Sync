package com.nforceone.sync.teamlead;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.teamlead.dto.BlockerStatusRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Project Managers (role PM) are read-only on blockers: acknowledging a blocker and changing its status
 * (the Resolve control) are rejected with 403 — enforced here, not just by hiding the buttons.
 *
 * Only the user and project repositories are wired; the guard runs before any task lookup, so reaching
 * a task repository (which is null here) would fail the test loudly.
 */
@ExtendWith(MockitoExtension.class)
class TeamLeadServiceBlockerPmTest {

    @Mock AppUserRepository userRepository;
    @Mock ProjectRepository projectRepository;
    @Mock com.nforceone.sync.eod.EodTaskRepository taskRepository;
    @Mock com.nforceone.sync.eod.BlockerReplyRepository replyRepository;

    private TeamLeadService service;
    private AppUser pm;

    @BeforeEach
    void setUp() {
        service = new TeamLeadService(userRepository, null, taskRepository, null, null, null, null, null, replyRepository, null,
                null, projectRepository, new LeadTeamPolicy(null, null, null), (Executor) Runnable::run);
        pm = new AppUser();
        pm.setId(7L);
        pm.setFullName("Surya T");
        pm.setEmail("surya@example.com");
        pm.setRole(AppUser.Role.PM);
        when(userRepository.findByEmailAndDeletedAtIsNull(pm.getEmail())).thenReturn(Optional.of(pm));
    }

    @Test
    void pmRole_cannotAcknowledgeABlocker_403() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.acknowledgeBlocker(1L, pm.getEmail()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void pmRole_cannotResolveOrChangeABlockersStatus_403() {
        for (String status : new String[]{"RESOLVED", "ACKNOWLEDGED", "NEEDS_RESPONSE"}) {
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> service.setBlockerStatus(1L, pm.getEmail(), new BlockerStatusRequest(status)), status);
            assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode(), status);
        }
    }

    private com.nforceone.sync.eod.EodTask blockerOn(Project project, AppUser author) {
        com.nforceone.sync.eod.EodEntry entry = new com.nforceone.sync.eod.EodEntry();
        entry.setEmployee(author);
        com.nforceone.sync.eod.EodTask task = new com.nforceone.sync.eod.EodTask();
        task.setId(1L);
        task.setEodEntry(entry);
        task.setProject(project);
        return task;
    }

    private AppUser plainUser(long id) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(AppUser.Role.EMPLOYEE);
        return u;
    }

    @Test
    void aPmWhoAlsoLeadsOtherProjects_isReadOnlyOnTheBlockerOfAProjectHeOnlyManages() {
        // Capacity, not role: he leads some project (so he passes the actor check) but this blocker is on a
        // project where he is only the PM -> read-only, with the explicit message.
        when(projectRepository.existsByLeadIdAndStatus(pm.getId(), Project.Status.ACTIVE)).thenReturn(true);
        Project managed = new Project();
        managed.setId(10L);
        managed.setLead(plainUser(50L));
        managed.setPm(pm);
        when(taskRepository.findById(1L)).thenReturn(Optional.of(blockerOn(managed, plainUser(60L))));

        ResponseStatusException ack = assertThrows(ResponseStatusException.class,
                () -> service.acknowledgeBlocker(1L, pm.getEmail()));
        ResponseStatusException status = assertThrows(ResponseStatusException.class,
                () -> service.setBlockerStatus(1L, pm.getEmail(), new BlockerStatusRequest("RESOLVED")));
        for (ResponseStatusException ex : new ResponseStatusException[]{ack, status}) {
            assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
            assertTrue(ex.getReason().contains("read-only view of blockers"), ex.getReason());
        }
    }

    @Test
    void theSameUserKeepsFullLeadActionsOnTheProjectHeLeads() {
        when(projectRepository.existsByLeadIdAndStatus(pm.getId(), Project.Status.ACTIVE)).thenReturn(true);
        Project led = new Project();
        led.setId(11L);
        led.setLead(pm);
        led.setPm(plainUser(70L));
        com.nforceone.sync.eod.EodTask task = blockerOn(led, plainUser(60L));
        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(taskRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(replyRepository.findByTaskIdOrderByCreatedAtAsc(1L)).thenReturn(java.util.List.of());

        assertDoesNotThrow(() -> service.acknowledgeBlocker(1L, pm.getEmail()));
        assertNotNull(task.getAcknowledgedAt());
    }
}
