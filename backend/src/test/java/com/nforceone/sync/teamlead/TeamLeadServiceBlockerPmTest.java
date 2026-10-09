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

    private TeamLeadService service;
    private AppUser pm;

    @BeforeEach
    void setUp() {
        service = new TeamLeadService(userRepository, null, null, null, null, null, null, null, null, null,
                null, projectRepository, (Executor) Runnable::run);
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

    @Test
    void pmRole_isRejectedByTheReadOnlyRule_evenWhenTheyWouldOtherwisePassTheLeadCheck() {
        // Belt and braces: if a PM-role user ever did lead an active project, requireLead would let them
        // through — the read-only guard must still stop the write, with its own explicit message.
        when(projectRepository.existsByLeadIdAndStatus(pm.getId(), Project.Status.ACTIVE)).thenReturn(true);

        ResponseStatusException ack = assertThrows(ResponseStatusException.class,
                () -> service.acknowledgeBlocker(1L, pm.getEmail()));
        ResponseStatusException status = assertThrows(ResponseStatusException.class,
                () -> service.setBlockerStatus(1L, pm.getEmail(), new BlockerStatusRequest("RESOLVED")));

        for (ResponseStatusException ex : new ResponseStatusException[]{ack, status}) {
            assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
            assertTrue(ex.getReason().contains("read-only view of blockers"), ex.getReason());
        }
        verify(projectRepository, atLeastOnce()).existsByLeadIdAndStatus(anyLong(), any());
    }
}
