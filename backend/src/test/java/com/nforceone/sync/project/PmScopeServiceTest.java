package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Verifies that requirePmScope grants access to PM role, SUPERADMIN, and any user who is pm_id
 * of at least one ACTIVE project, and denies access to everyone else.
 */
@ExtendWith(MockitoExtension.class)
class PmScopeServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    private PmScopeService pmScopeService;

    @BeforeEach
    void setUp() {
        pmScopeService = new PmScopeService(projectRepository);
    }

    // ── gate-check tests ──────────────────────────────────────────────────────

    @Test
    void pmRole_alwaysPasses_evenWithNoProjects() {
        AppUser pm = user(1L, AppUser.Role.PM);
        // No stubbing needed — the role check short-circuits before hitting the repo.
        assertDoesNotThrow(() -> pmScopeService.requirePmScope(pm));
        verifyNoInteractions(projectRepository);
    }

    @Test
    void superadmin_alwaysPasses() {
        AppUser sa = user(2L, AppUser.Role.SUPERADMIN);
        assertDoesNotThrow(() -> pmScopeService.requirePmScope(sa));
        verifyNoInteractions(projectRepository);
    }

    @Test
    void admin_passesWhenManagesAtLeastOneActiveProject() {
        AppUser admin = user(3L, AppUser.Role.ADMIN);
        when(projectRepository.existsByPmIdAndStatus(3L, Project.Status.ACTIVE)).thenReturn(true);
        assertDoesNotThrow(() -> pmScopeService.requirePmScope(admin));
    }

    @Test
    void employee_passesWhenManagesAtLeastOneActiveProject() {
        AppUser emp = user(4L, AppUser.Role.EMPLOYEE);
        when(projectRepository.existsByPmIdAndStatus(4L, Project.Status.ACTIVE)).thenReturn(true);
        assertDoesNotThrow(() -> pmScopeService.requirePmScope(emp));
    }

    @Test
    void admin_forbiddenWhenManagesNoActiveProject() {
        AppUser admin = user(5L, AppUser.Role.ADMIN);
        when(projectRepository.existsByPmIdAndStatus(5L, Project.Status.ACTIVE)).thenReturn(false);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> pmScopeService.requirePmScope(admin));
        assertEquals(403, ex.getStatusCode().value());
    }

    @Test
    void employee_forbiddenWhenManagesNoProject() {
        AppUser emp = user(6L, AppUser.Role.EMPLOYEE);
        when(projectRepository.existsByPmIdAndStatus(6L, Project.Status.ACTIVE)).thenReturn(false);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> pmScopeService.requirePmScope(emp));
        assertEquals(403, ex.getStatusCode().value());
    }

    // ── isProjectManager helper ───────────────────────────────────────────────

    @Test
    void isProjectManager_trueForPmRole() {
        assertTrue(pmScopeService.isProjectManager(user(10L, AppUser.Role.PM)));
        verifyNoInteractions(projectRepository);
    }

    @Test
    void isProjectManager_trueForSuperadmin() {
        assertTrue(pmScopeService.isProjectManager(user(11L, AppUser.Role.SUPERADMIN)));
        verifyNoInteractions(projectRepository);
    }

    @Test
    void isProjectManager_trueForAdminWhoManagesProject() {
        AppUser admin = user(12L, AppUser.Role.ADMIN);
        when(projectRepository.existsByPmIdAndStatus(12L, Project.Status.ACTIVE)).thenReturn(true);
        assertTrue(pmScopeService.isProjectManager(admin));
    }

    @Test
    void isProjectManager_falseForEmployeeWithNoProject() {
        AppUser emp = user(13L, AppUser.Role.EMPLOYEE);
        when(projectRepository.existsByPmIdAndStatus(13L, Project.Status.ACTIVE)).thenReturn(false);
        assertFalse(pmScopeService.isProjectManager(emp));
    }

    /** A PM with role PM but pm_id of none of the projects still passes the role gate. */
    @Test
    void pmRoleWithNoProjects_passesGateGetsEmptyScope() {
        AppUser pm = user(20L, AppUser.Role.PM);
        // gate passes (role PM short-circuits)
        assertDoesNotThrow(() -> pmScopeService.requirePmScope(pm));
        // scopedProjects returns whatever the repo says (empty in practice)
        when(projectRepository.findByPmIdOrderByNameAsc(20L)).thenReturn(java.util.List.of());
        assertTrue(pmScopeService.scopedProjects(pm).isEmpty());
    }

    /** A PM asking for another PM's data is handled by scopedProjects always scoping to actor.id. */
    @Test
    void pmScopedToOwnProjects_notAnotherPmsProjects() {
        AppUser actorPm  = user(30L, AppUser.Role.PM);
        AppUser otherPm  = user(99L, AppUser.Role.PM);

        Project myProject = new Project(); myProject.setId(1001L);
        when(projectRepository.findByPmIdOrderByNameAsc(30L)).thenReturn(java.util.List.of(myProject));
        when(projectRepository.findByPmIdOrderByNameAsc(99L)).thenReturn(java.util.List.of()); // other PM's

        var actorProjects = pmScopeService.scopedProjects(actorPm);
        assertEquals(1, actorProjects.size());
        assertEquals(1001L, actorProjects.get(0).getId());

        // Other PM's scope is separate — actor cannot see them
        var otherProjects = pmScopeService.scopedProjects(otherPm);
        assertTrue(otherProjects.isEmpty());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        return u;
    }
}
