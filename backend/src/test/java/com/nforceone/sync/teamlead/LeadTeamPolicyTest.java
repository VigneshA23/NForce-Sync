package com.nforceone.sync.teamlead;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.approval2.EodProjectApprovalRepository;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.AllocationRepository;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** The one definition of "a lead's team" and what a lead may read of an entry. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LeadTeamPolicyTest {

    @Mock AllocationRepository allocationRepository;
    @Mock ProjectRepository projectRepository;
    @Mock EodProjectApprovalRepository pieceRepository;

    private LeadTeamPolicy policy;
    private AppUser leadA, leadB, akhila;
    private Project projA, projB;

    @BeforeEach
    void setUp() {
        policy = new LeadTeamPolicy(allocationRepository, projectRepository, pieceRepository);
        leadA = user(1L); leadB = user(2L); akhila = user(3L);
        projA = project(10L, leadA);
        projB = project(20L, leadB);
        when(projectRepository.findByLeadIdOrderByNameAsc(leadA.getId())).thenReturn(List.of(projA));
        when(projectRepository.findByLeadIdOrderByNameAsc(leadB.getId())).thenReturn(List.of(projB));
        when(pieceRepository.findByEodEntryId(any())).thenReturn(List.of());
    }

    private AppUser user(Long id) { AppUser u = new AppUser(); u.setId(id); return u; }

    private Project project(Long id, AppUser lead) {
        Project p = new Project(); p.setId(id); p.setLead(lead); return p;
    }

    private EodEntry entry(AppUser owner, Project... taskProjects) {
        EodEntry e = new EodEntry();
        e.setId(500L);
        e.setEmployee(owner);
        for (Project p : taskProjects) {
            EodTask t = new EodTask();
            t.setProject(p);
            e.getTasks().add(t);
        }
        return e;
    }

    @Test
    void team_isTheActiveAllocationMembersOfTheLeadsProjects_forTheRequestedDate() {
        LocalDate d = LocalDate.of(2026, 9, 1);
        when(allocationRepository.findActiveMembersByProjectLead(leadA.getId(), d)).thenReturn(List.of(akhila));

        assertEquals(List.of(akhila), policy.teamMembers(leadA.getId(), d));
        assertTrue(policy.teamMembers(leadB.getId(), d).isEmpty(), "lead B's team is separate");
    }

    @Test
    void isInTeam_isFalseForAnotherLeadsMember() {
        when(allocationRepository.findActiveMembersByProjectLead(eq(leadA.getId()), any())).thenReturn(List.of(akhila));
        when(allocationRepository.findActiveMembersByProjectLead(eq(leadB.getId()), any())).thenReturn(List.of());

        assertTrue(policy.isInTeam(akhila.getId(), leadA.getId()));
        assertFalse(policy.isInTeam(akhila.getId(), leadB.getId()));
    }

    @Test
    void ledProjects_areTheProjectsHeLeads() {
        assertEquals(Set.of(10L), policy.ledProjectIds(leadA.getId()));
        assertEquals(Set.of(20L), policy.ledProjectIds(leadB.getId()));
    }

    // ── entry access as a lead ────────────────────────────────────────────────

    @Test
    void lead_readsAnEntryWithATaskOnHisProject() {
        assertTrue(policy.canReadEntryAsLead(leadA.getId(), entry(akhila, projA)));
    }

    @Test
    void lead_readsASharedEntry_butTheOtherLeadsAreIndependent() {
        EodEntry shared = entry(akhila, projA, projB);
        assertTrue(policy.canReadEntryAsLead(leadA.getId(), shared));
        assertTrue(policy.canReadEntryAsLead(leadB.getId(), shared));
    }

    @Test
    void lead_cannotReadAnEntryWithNoTaskOnHisProjectAndNoPiece() {
        // Akhila may be allocated to lead A's project, but this day was spent on project B.
        assertFalse(policy.canReadEntryAsLead(leadA.getId(), entry(akhila, projB)));
        assertFalse(policy.canReadEntryAsLead(leadA.getId(), entry(akhila)));
    }

    @Test
    void lead_readsAnEntryWhereHeApprovesAPiece_evenWithoutAMatchingTask() {
        EodEntry e = entry(akhila, projB);
        EodProjectApproval piece = new EodProjectApproval();
        piece.setApprover(leadA);
        when(pieceRepository.findByEodEntryId(e.getId())).thenReturn(List.of(piece));

        assertTrue(policy.canReadEntryAsLead(leadA.getId(), e));
    }

    @Test
    void lead_neverReadsHisOwnEntryAsALead() {
        assertFalse(policy.canReadEntryAsLead(leadA.getId(), entry(leadA, projA)));
    }
}
