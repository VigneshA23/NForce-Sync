package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * EodClarificationAccessPolicy — open/resolve/reply access expanded in parity
 * with BlockerConversationService (gap 3): frozen RM, project lead, and project PM
 * may all open, resolve, and reply; unrelated users get 403.
 *
 * Before fix: only frozen RM (entry.managerId) could open/resolve/reply.
 * After fix:  frozen RM OR project lead OR project PM; employee can reply only.
 */
class EodClarificationAccessPolicyTest {

    private AppUser employee;
    private AppUser frozenRm;
    private AppUser projectLead;
    private AppUser projectPm;
    private AppUser unrelated;

    private EodEntry entry;

    @BeforeEach
    void setUp() {
        employee    = user(1L, "Akhila S");
        frozenRm    = user(2L, "Ramesh A");
        projectLead = user(3L, "Vignesh A");
        projectPm   = user(4L, "Dheeraj S");
        unrelated   = user(5L, "Other User");

        Project project = new Project();
        project.setId(10L);
        project.setName("Nforce Sync");
        project.setLead(projectLead);
        project.setPm(projectPm);

        EodTask task = new EodTask();
        task.setProject(project);

        entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(employee);
        entry.setManagerId(frozenRm.getId());
        entry.setEntryDate(java.time.LocalDate.of(2026, 9, 1));
        entry.setStatus(EodEntry.Status.SUBMITTED);
        entry.getTasks().add(task);
    }

    private AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        u.setRole(AppUser.Role.EMPLOYEE);
        return u;
    }

    // ── requireCanOpenOrResolve ────────────────────────────────────────────────

    @Test
    void frozenRm_canOpenOrResolve() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(frozenRm, entry));
    }

    @Test
    void projectLead_canOpenOrResolve() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry));
    }

    @Test
    void projectPm_canOpenOrResolve() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectPm, entry));
    }

    @Test
    void unrelated_cannotOpenOrResolve_gets403() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> EodClarificationAccessPolicy.requireCanOpenOrResolve(unrelated, entry));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void employee_cannotOpenOrResolve_gets403() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> EodClarificationAccessPolicy.requireCanOpenOrResolve(employee, entry));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── requireCanReply ───────────────────────────────────────────────────────

    @Test
    void frozenRm_canReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(frozenRm, entry));
    }

    @Test
    void projectLead_canReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(projectLead, entry));
    }

    @Test
    void projectPm_canReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(projectPm, entry));
    }

    @Test
    void employee_canReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(employee, entry));
    }

    @Test
    void unrelated_cannotReply_gets403() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> EodClarificationAccessPolicy.requireCanReply(unrelated, entry));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── requireCanRead ────────────────────────────────────────────────────────

    @Test
    void all_authorized_users_canRead() {
        for (AppUser u : List.of(employee, frozenRm, projectLead, projectPm)) {
            assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(u, entry),
                    u.getFullName() + " should be able to read");
        }
    }

    @Test
    void unrelated_cannotRead_gets403() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> EodClarificationAccessPolicy.requireCanRead(unrelated, entry));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }
}
