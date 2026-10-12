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

    @Mock
    private AllocationRepository allocationRepository;

    private PmScopeService pmScopeService;

    @BeforeEach
    void setUp() {
        pmScopeService = new PmScopeService(projectRepository, allocationRepository);
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

    // ── one scope for every PM page ────────────────────────────────────────────

    private static Project project(Long id, AppUser pm) {
        Project p = new Project(); p.setId(id); p.setPm(pm); return p;
    }

    private static Allocation allocation(AppUser employee, Project project) {
        Allocation a = new Allocation(); a.setEmployee(employee); a.setProject(project); return a;
    }

    @Test
    void requireProjectInScope_isA403_forAnotherPmsProject_byId() {
        AppUser pmA = user(30L, AppUser.Role.PM);
        when(projectRepository.findByPmIdOrderByNameAsc(30L)).thenReturn(java.util.List.of(project(1001L, pmA)));

        assertEquals(1001L, pmScopeService.requireProjectInScope(pmA, 1001L).getId());
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> pmScopeService.requireProjectInScope(pmA, 2002L));
        assertEquals(403, ex.getStatusCode().value());
    }

    @Test
    void superadminNarrowsToOnePmsPortfolio_butAPmCannotWidenHisOwn() {
        AppUser sa = user(1L, AppUser.Role.SUPERADMIN);
        AppUser pm = user(30L, AppUser.Role.PM);
        when(projectRepository.findByPmIdOrderByNameAsc(99L)).thenReturn(java.util.List.of(project(7L, null)));
        when(projectRepository.findByPmIdOrderByNameAsc(30L)).thenReturn(java.util.List.of(project(8L, pm)));

        assertEquals(7L, pmScopeService.scopedProjects(sa, 99L).get(0).getId());
        // the same override from a PM is ignored: he stays on his own projects
        assertEquals(8L, pmScopeService.scopedProjects(pm, 99L).get(0).getId());
    }

    @Test
    void members_areTheAllocationsOnHisProjects_withTheManagerHimselfExcluded() {
        AppUser pm = user(30L, AppUser.Role.EMPLOYEE);   // a PM by assignment, allocated on his own project too
        AppUser ravi = user(31L, AppUser.Role.EMPLOYEE);
        Project p = project(1L, pm);
        java.time.LocalDate from = java.time.LocalDate.of(2026, 10, 1);
        java.time.LocalDate to = java.time.LocalDate.of(2026, 10, 12);
        when(allocationRepository.findActiveInRangeForProjects(java.util.List.of(1L), from, to))
                .thenReturn(java.util.List.of(allocation(pm, p), allocation(ravi, p)));

        var result = pmScopeService.memberAllocations(pm, java.util.List.of(1L), from, to);

        assertEquals(1, result.size());
        assertEquals(31L, result.get(0).getEmployee().getId());
    }

    @Test
    void members_ofNoProjects_isEmpty_withoutTouchingTheRepository() {
        assertTrue(pmScopeService.memberAllocations(user(30L, AppUser.Role.PM), java.util.List.of(),
                java.time.LocalDate.now(), java.time.LocalDate.now()).isEmpty());
        verifyNoInteractions(allocationRepository);
    }

    @Test
    void isMember_requiresAnAllocationOnOneOfHisProjects_andNeverTheManagerHimself() {
        AppUser pm = user(30L, AppUser.Role.PM);
        java.time.LocalDate d = java.time.LocalDate.of(2026, 10, 9);
        when(projectRepository.findByPmIdOrderByNameAsc(30L)).thenReturn(java.util.List.of(project(1L, pm)));
        when(allocationRepository.existsMemberOnProjects(31L, java.util.Set.of(1L), d, d)).thenReturn(true);
        when(allocationRepository.existsMemberOnProjects(32L, java.util.Set.of(1L), d, d)).thenReturn(false);

        assertTrue(pmScopeService.isMember(pm, 31L, d, d));
        assertFalse(pmScopeService.isMember(pm, 32L, d, d));   // on someone else's project
        assertFalse(pmScopeService.isMember(pm, 30L, d, d));   // himself
    }

    @Test
    void perRecordChecks_followTheProjectsPm_notTheRole() {
        AppUser pmByAssignment = user(30L, AppUser.Role.EMPLOYEE);
        AppUser other = user(31L, AppUser.Role.PM);
        Project p = project(1L, pmByAssignment);
        com.nforceone.sync.eod.EodTask task = new com.nforceone.sync.eod.EodTask();
        task.setProject(p);
        com.nforceone.sync.eod.EodEntry entry = new com.nforceone.sync.eod.EodEntry();
        entry.setEmployee(user(9L, AppUser.Role.EMPLOYEE));
        entry.getTasks().add(task);

        assertTrue(PmScopeService.isPmOf(pmByAssignment, p));
        assertFalse(PmScopeService.isPmOf(other, p));
        assertTrue(PmScopeService.canReadEntryAsPm(pmByAssignment, entry));
        assertFalse(PmScopeService.canReadEntryAsPm(other, entry));     // a PM role is not enough
        entry.setEmployee(pmByAssignment);
        assertFalse(PmScopeService.canReadEntryAsPm(pmByAssignment, entry));   // never his own entry
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        return u;
    }
}
