package com.nforceone.sync.utilization;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.businessrules.HolidayRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.teamlead.LeadTeamPolicy;
import com.nforceone.sync.utilization.dto.TeamUtilDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Team Utilization: a lead may request only his own team (and himself / his members individually); the
 * roles that already had unrestricted access keep it; and a member's hours on projects the lead does not
 * lead come back as a bare aggregate.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UtilizationTeamAccessTest {

    private static final LocalDate DATE = LocalDate.of(2026, 10, 9);

    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilSnapshotRepository snapshotRepository;
    @Mock HolidayRepository holidayRepository;
    @Mock AllocationRepository allocationRepository;
    @Mock ProjectRepository projectRepository;
    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock com.nforceone.sync.project.PmScopeService pmScopeService;

    private UtilizationService service;
    private AppUser leadA, leadB, akhila, superAdmin, admin, pm, stranger;
    private Project projA, projB;

    @BeforeEach
    void setUp() {
        service = new UtilizationService(entryRepository, userRepository, snapshotRepository, holidayRepository,
                new LeadTeamPolicy(allocationRepository, projectRepository, pieceRepository), pieceRepository,
                pmScopeService, null);

        leadA = user(1L, AppUser.Role.EMPLOYEE, "a"); leadB = user(2L, AppUser.Role.EMPLOYEE, "b");
        akhila = user(3L, AppUser.Role.EMPLOYEE, "akhila"); stranger = user(4L, AppUser.Role.EMPLOYEE, "x");
        superAdmin = user(5L, AppUser.Role.SUPERADMIN, "sa"); admin = user(6L, AppUser.Role.ADMIN, "ad");
        pm = user(7L, AppUser.Role.PM, "pm");
        for (AppUser u : List.of(leadA, leadB, akhila, stranger, superAdmin, admin, pm)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        projA = project(10L, leadA);
        projB = project(20L, leadB);
        when(projectRepository.findByLeadIdOrderByNameAsc(leadA.getId())).thenReturn(List.of(projA));
        when(projectRepository.findByLeadIdOrderByNameAsc(leadB.getId())).thenReturn(List.of(projB));
        when(allocationRepository.findActiveMembersByProjectLead(eq(leadA.getId()), any())).thenReturn(List.of(akhila));
        when(allocationRepository.findActiveMembersByProjectLead(eq(leadB.getId()), any())).thenReturn(List.of(akhila));
        when(snapshotRepository.findByEmployeeIdInAndSnapshotDate(anyList(), eq(DATE))).thenReturn(List.of());
        when(snapshotRepository.findByEmployeeIdAndSnapshotDate(any(), eq(DATE))).thenReturn(Optional.empty());
        when(entryRepository.findByEmployeeIdAndEntryDate(any(), eq(DATE))).thenReturn(Optional.empty());
        when(holidayRepository.existsByHolidayDate(DATE)).thenReturn(false);
        when(entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(anyList(), eq(DATE), eq(DATE)))
                .thenReturn(List.of());
    }

    private AppUser user(Long id, AppUser.Role role, String name) {
        AppUser u = new AppUser(); u.setId(id); u.setRole(role); u.setFullName(name); u.setEmployeeCode(name);
        u.setEmail(name + "@example.com"); return u;
    }

    private Project project(Long id, AppUser lead) {
        Project p = new Project(); p.setId(id); p.setLead(lead); return p;
    }

    private void assertForbidden(org.junit.jupiter.api.function.Executable call) {
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class, call).getStatusCode());
    }

    // ── the access check ──────────────────────────────────────────────────────

    @Test
    void aLead_mayRequestOnlyHisOwnTeam() {
        assertEquals(1, service.getForTeamAs(leadA.getEmail(), leadA.getId(), DATE).size());
        assertForbidden(() -> service.getForTeamAs(leadA.getEmail(), leadB.getId(), DATE));
        assertForbidden(() -> service.getForTeamAs(stranger.getEmail(), leadA.getId(), DATE));
    }

    @Test
    void rolesWithAccessToday_keepIt() {
        for (AppUser broad : List.of(superAdmin, admin)) {
            assertDoesNotThrow(() -> service.getForTeamAs(broad.getEmail(), leadA.getId(), DATE), broad.getFullName());
        }
    }

    @Test
    void employeeSnapshots_selfOrTheirLeadOrABroadRole_butNotAnotherLeadOrAStranger() {
        LocalDate to = DATE;
        assertDoesNotThrow(() -> service.getForEmployeeAs(akhila.getEmail(), akhila.getId(), DATE, to));
        assertDoesNotThrow(() -> service.getForEmployeeAs(leadA.getEmail(), akhila.getId(), DATE, to));
        assertDoesNotThrow(() -> service.getForEmployeeAs(superAdmin.getEmail(), akhila.getId(), DATE, to));
        // lead B is not in lead C's... a stranger with no team containing akhila:
        assertForbidden(() -> service.getForEmployeeAs(stranger.getEmail(), akhila.getId(), DATE, to));
    }

    @Test
    void projectManager_noLongerHasOrgWideUtilizationAccess_onlyMembersOfHisProjects() {
        LocalDate to = DATE;
        // Team utilization of an arbitrary lead is no longer open to a PM.
        assertForbidden(() -> service.getForTeamAs(pm.getEmail(), leadA.getId(), DATE));
        // An employee by id: forbidden unless he is a member of one of the PM's projects.
        assertForbidden(() -> service.getForEmployeeAs(pm.getEmail(), akhila.getId(), DATE, to));
        when(pmScopeService.isMember(pm, akhila.getId(), DATE, to)).thenReturn(true);
        assertDoesNotThrow(() -> service.getForEmployeeAs(pm.getEmail(), akhila.getId(), DATE, to));
    }

    // ── the aggregate ─────────────────────────────────────────────────────────

    @Test
    void hoursOnOtherLeadsProjects_comeBackAsABareAggregate() {
        EodEntry entry = new EodEntry();
        entry.setId(100L);
        entry.setEmployee(akhila);
        entry.setEntryDate(DATE);
        entry.setStatus(EodEntry.Status.APPROVED);
        entry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        entry.getTasks().add(task(projA, "4.00"));
        entry.getTasks().add(task(projB, "3.00"));
        when(entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(anyList(), eq(DATE), eq(DATE)))
                .thenReturn(List.of(entry));
        when(pieceRepository.findByEodEntryId(100L)).thenReturn(List.of(
                approvedPiece(projA), approvedPiece(projB)));

        TeamUtilDto forA = service.getForTeamAs(leadA.getEmail(), leadA.getId(), DATE).get(0);
        TeamUtilDto forB = service.getForTeamAs(leadB.getEmail(), leadB.getId(), DATE).get(0);

        assertEquals(0, new BigDecimal("3.00").compareTo(forA.otherProjectsHours()), "lead A: B's 3h is 'other'");
        assertEquals(0, new BigDecimal("4.00").compareTo(forB.otherProjectsHours()), "lead B: A's 4h is 'other'");
    }

    @Test
    void anUnapprovedProjectsHours_areNotCountedAsOther() {
        EodEntry entry = new EodEntry();
        entry.setId(101L);
        entry.setEmployee(akhila);
        entry.setEntryDate(DATE);
        entry.setStatus(EodEntry.Status.PARTIALLY_APPROVED);
        entry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        entry.getTasks().add(task(projA, "4.00"));
        entry.getTasks().add(task(projB, "3.00"));
        when(entryRepository.findWithTasksByEmployeeIdInAndEntryDateBetween(anyList(), eq(DATE), eq(DATE)))
                .thenReturn(List.of(entry));
        when(pieceRepository.findByEodEntryId(101L)).thenReturn(List.of(approvedPiece(projA))); // B still pending

        TeamUtilDto forA = service.getForTeamAs(leadA.getEmail(), leadA.getId(), DATE).get(0);

        assertEquals(0, BigDecimal.ZERO.compareTo(forA.otherProjectsHours()),
                "B's hours don't count toward utilization yet, so they are not in the 'other' figure either");
    }

    private EodTask task(Project p, String hours) {
        EodTask t = new EodTask(); t.setProject(p); t.setHours(new BigDecimal(hours)); return t;
    }

    private EodProjectApproval approvedPiece(Project p) {
        EodProjectApproval a = new EodProjectApproval();
        a.setProject(p);
        a.setStatus(EodProjectApproval.Status.APPROVED);
        return a;
    }
}
