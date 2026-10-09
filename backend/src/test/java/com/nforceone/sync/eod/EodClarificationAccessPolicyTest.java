package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * EodClarificationAccessPolicy — reviewer authority follows the entry's CURRENT-cycle approval
 * pieces (approver / escalated-to of a PENDING piece), evaluated live:
 *
 *  - open / resolve / reviewer reply: pending-piece approver, escalated-to PM, or Super Admin;
 *  - owner replies as the employee, and can never act as reviewer on their own EOD;
 *  - the frozen reporting manager and any project PM can READ but not open or reply,
 *    unless they are also an approver / escalatee;
 *  - reassignment: the previous approver loses access immediately, the new one gains it.
 */
class EodClarificationAccessPolicyTest {

    private AppUser employee;
    private AppUser frozenRm;
    private AppUser projectLead;
    private AppUser projectPm;
    private AppUser unrelated;

    private EodEntry entry;
    private EodProjectApproval leadPiece;

    @BeforeEach
    void setUp() {
        employee    = user(1L, "Akhila S", AppUser.Role.EMPLOYEE);
        frozenRm    = user(2L, "Ramesh A", AppUser.Role.EMPLOYEE);
        projectLead = user(3L, "Vignesh A", AppUser.Role.EMPLOYEE);
        projectPm   = user(4L, "Dheeraj S", AppUser.Role.PM);
        unrelated   = user(5L, "Other User", AppUser.Role.EMPLOYEE);

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

        leadPiece = piece(1L, projectLead, EodProjectApproval.ApproverType.LEAD, EodProjectApproval.Status.PENDING);
    }

    private AppUser user(Long id, String name, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        u.setEmail(name.toLowerCase().replace(" ", ".") + "@example.com");
        u.setRole(role);
        return u;
    }

    private EodProjectApproval piece(Long id, AppUser approver, EodProjectApproval.ApproverType type,
                                      EodProjectApproval.Status status) {
        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setEodEntry(entry);
        p.setApprover(approver);
        p.setApproverType(type);
        p.setStatus(status);
        return p;
    }

    private List<EodProjectApproval> pieces() {
        return List.of(leadPiece);
    }

    private static void assertForbidden(org.junit.jupiter.api.function.Executable call) {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, call);
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    // ── open / resolve: who may act as reviewer ───────────────────────────────

    @Test
    void pendingPieceApprover_canOpenOrResolve() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, pieces()));
    }

    @Test
    void superAdmin_canOpenOrResolve() {
        AppUser root = user(99L, "Root", AppUser.Role.SUPERADMIN);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(root, entry, pieces()));
    }

    @Test
    void escalatedPm_isReadOnly_whileTheLeadKeepsAccess() {
        // A Project Manager (role PM) is read-only on clarifications even as the escalated approver.
        leadPiece.setEscalatedTo(projectPm);
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectPm, entry, pieces()));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, pieces()));
    }

    @Test
    void adminOnAdminGroupPiece_canOpen_butNotOnOtherPieces() {
        AppUser admin = user(98L, "Admin", AppUser.Role.ADMIN);
        EodProjectApproval adminPiece = piece(2L, null, EodProjectApproval.ApproverType.ADMIN_GROUP,
                EodProjectApproval.Status.PENDING);

        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(admin, entry, List.of(adminPiece)));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(admin, entry, pieces()));
    }

    @Test
    void unrelated_cannotOpenOrResolve_gets403() {
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(unrelated, entry, pieces()));
    }

    @Test
    void employee_cannotOpenOrResolve_gets403() {
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(employee, entry, pieces()));
    }

    // ── RM and project PM: read-only unless also the approver ─────────────────

    @Test
    void nonApproverRm_canRead_butGets403OnOpenAndReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(frozenRm, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(frozenRm, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(frozenRm, entry, pieces()));
        assertFalse(EodClarificationAccessPolicy.canReview(frozenRm, entry, pieces()));
    }

    @Test
    void rmWhoIsAlsoThePieceApprover_hasFullAccess() {
        EodProjectApproval rmPiece = piece(3L, frozenRm, EodProjectApproval.ApproverType.REPORTING_MANAGER,
                EodProjectApproval.Status.PENDING);
        List<EodProjectApproval> withRmPiece = List.of(leadPiece, rmPiece);

        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(frozenRm, entry, withRmPiece));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(frozenRm, entry, withRmPiece));
    }

    @Test
    void nonApproverProjectPm_canRead_butGets403OnOpenAndReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(projectPm, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectPm, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(projectPm, entry, pieces()));
    }

    @Test
    void projectPmWhoIsEscalatedTo_canReadButNotOpenOrReply() {
        leadPiece.setEscalatedTo(projectPm);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(projectPm, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectPm, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(projectPm, entry, pieces()));
    }

    @Test
    void projectLeadWithoutAPiece_noLongerGetsAccessFromTheLiveProjectLeadField() {
        // project.lead still points at projectLead, but they hold no piece on this entry.
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, List.of()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanRead(projectLead, entry, List.of()));
    }

    // ── decided pieces: nothing left to clarify ───────────────────────────────

    @Test
    void approverOfAlreadyApprovedPiece_cannotOpen() {
        leadPiece.setStatus(EodProjectApproval.Status.APPROVED);
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, pieces()));
    }

    @Test
    void approverOfAlreadyRejectedPiece_cannotOpen() {
        leadPiece.setStatus(EodProjectApproval.Status.REJECTED);
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, pieces()));
    }

    @Test
    void approverOfDecidedPiece_canStillRead() {
        leadPiece.setStatus(EodProjectApproval.Status.APPROVED);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(projectLead, entry, pieces()));
    }

    @Test
    void partiallyApproved_pendingPieceApproverCanOpen_decidedPieceApproverCannot() {
        AppUser otherLead = user(6L, "Other Lead", AppUser.Role.EMPLOYEE);
        leadPiece.setStatus(EodProjectApproval.Status.APPROVED);          // projectLead's piece: done
        EodProjectApproval pending = piece(2L, otherLead, EodProjectApproval.ApproverType.LEAD,
                EodProjectApproval.Status.PENDING);                       // otherLead's piece: pending
        List<EodProjectApproval> mixed = List.of(leadPiece, pending);

        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(otherLead, entry, mixed));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, mixed));
    }

    // ── self-block: nobody reviews their own EOD ──────────────────────────────

    @Test
    void ownerWhoIsAlsoAPieceApprover_cannotOpenOrResolveOwnEod() {
        // A TL who leads a project in their own EOD: the piece names them as approver, but the
        // owner can never act as reviewer on it.
        leadPiece.setApprover(employee);
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(employee, entry, pieces()));
        assertFalse(EodClarificationAccessPolicy.canReview(employee, entry, pieces()));
    }

    @Test
    void ownerWhoIsSuperAdmin_cannotOpenOwnEod_selfBlockRunsBeforeTheBypass() {
        employee.setRole(AppUser.Role.SUPERADMIN);
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(employee, entry, pieces()));
    }

    @Test
    void ownerWhoIsAlsoAPieceApprover_stillRepliesButOnlyAsTheEmployee() {
        leadPiece.setApprover(employee);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(employee, entry, pieces()));
        assertTrue(EodClarificationAccessPolicy.isOwningEmployee(employee, entry));
        assertFalse(EodClarificationAccessPolicy.canReview(employee, entry, pieces()));
    }

    // ── reassignment: access follows the current approver ─────────────────────

    @Test
    void reassignedPiece_previousApproverLosesAccess_newApproverGains() {
        AppUser newLead = user(7L, "New Lead", AppUser.Role.EMPLOYEE);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(projectLead, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(newLead, entry, pieces()));

        leadPiece.setApprover(newLead);   // thread moves to the current approver

        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectLead, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(projectLead, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanRead(projectLead, entry, pieces()));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(newLead, entry, pieces()));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(newLead, entry, pieces()));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(newLead, entry, pieces()));
    }

    @Test
    void supersededCycleApprover_isNotInTheCurrentPieceList_soHasNoAccess() {
        // findByEodEntryId returns current-cycle pieces only, so after the employee resubmits,
        // the old cycle's approver is simply absent from the list the policy receives.
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(projectLead, entry, List.of()));
    }

    // ── reply ─────────────────────────────────────────────────────────────────

    @Test
    void employee_canReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(employee, entry, pieces()));
    }

    @Test
    void pendingApprover_canReply() {
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(projectLead, entry, pieces()));
    }

    @Test
    void unrelated_cannotReply_gets403() {
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(unrelated, entry, pieces()));
    }

    // ── read ──────────────────────────────────────────────────────────────────

    @Test
    void allParticipantsAndReadOnlyObservers_canRead() {
        AppUser root = user(99L, "Root", AppUser.Role.SUPERADMIN);
        for (AppUser u : List.of(employee, projectLead, frozenRm, projectPm, root)) {
            assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(u, entry, pieces()),
                    u.getFullName() + " should be able to read");
        }
    }

    @Test
    void unrelated_cannotRead_gets403() {
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanRead(unrelated, entry, pieces()));
    }

    // ── Project Managers (role PM) are read-only ─────────────────────────────────

    @Test
    void pmRole_asThePiecesOwnApprover_stillCannotOpenReplyOrResolve_butCanRead() {
        EodProjectApproval pmPiece = piece(9L, projectPm, EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING);
        List<EodProjectApproval> pmPieces = List.of(pmPiece);

        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectPm, entry, pmPieces));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(projectPm, entry, pmPieces));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(projectPm, entry, pmPieces));
        assertFalse(EodClarificationAccessPolicy.canReview(projectPm, entry, pmPieces));
        assertFalse(EodClarificationAccessPolicy.canReply(projectPm, entry, pmPieces));
    }

    @Test
    void pmRole_403Message_saysReadOnly_andNamesTheTeamLeads() {
        ResponseStatusException open = assertThrows(ResponseStatusException.class,
                () -> EodClarificationAccessPolicy.requireCanOpenOrResolve(projectPm, entry, pieces()));
        ResponseStatusException reply = assertThrows(ResponseStatusException.class,
                () -> EodClarificationAccessPolicy.requireCanReply(projectPm, entry, pieces()));
        assertEquals(HttpStatus.FORBIDDEN, open.getStatusCode());
        assertTrue(open.getReason().contains("read-only view of clarifications"), open.getReason());
        assertTrue(reply.getReason().contains("read-only view of clarifications"), reply.getReason());
    }

    @Test
    void pmRole_whoOwnsTheEntry_isTheEmployeeSide_andCanStillReplyToTheirOwnEod() {
        // A PM submits their own daily log; replying to a clarification on it is the employee side.
        entry.setEmployee(projectPm);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(projectPm, entry, pieces()));
        assertFalse(EodClarificationAccessPolicy.canReview(projectPm, entry, pieces()));
    }

    @Test
    void anyRoleEscalatedToAsPm_isReadOnly_becauseTheyActInThePmCapacity() {
        // Anyone can be a project's PM by assignment; the escalation target acts as the PM whatever their role.
        AppUser employeeRoleEscalatee = user(40L, "Escalatee", AppUser.Role.EMPLOYEE);
        leadPiece.setEscalatedTo(employeeRoleEscalatee);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(employeeRoleEscalatee, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(employeeRoleEscalatee, entry, pieces()));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(employeeRoleEscalatee, entry, pieces()));
    }

    @Test
    void anyRoleHoldingAPmTypePiece_isReadOnly() {
        AppUser employeeRolePm = user(41L, "Assigned PM", AppUser.Role.EMPLOYEE);
        EodProjectApproval pmPiece = piece(8L, employeeRolePm, EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING);
        List<EodProjectApproval> only = List.of(pmPiece);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanRead(employeeRolePm, entry, only));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(employeeRolePm, entry, only));
        assertForbidden(() -> EodClarificationAccessPolicy.requireCanReply(employeeRolePm, entry, only));
    }

    @Test
    void aTeamLeadPiece_stillGivesFullRights_evenToSomeoneWhoIsAlsoAPm() {
        // The same user holds the lead piece (Team Lead capacity) and is escalated-to on another (PM capacity):
        // the Team Lead capacity is enough to review.
        AppUser both = user(42L, "Lead and PM", AppUser.Role.EMPLOYEE);
        EodProjectApproval asLead = piece(11L, both, EodProjectApproval.ApproverType.LEAD, EodProjectApproval.Status.PENDING);
        EodProjectApproval asPm = piece(12L, projectLead, EodProjectApproval.ApproverType.LEAD, EodProjectApproval.Status.PENDING);
        asPm.setEscalatedTo(both);
        List<EodProjectApproval> mixed = List.of(asLead, asPm);
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanOpenOrResolve(both, entry, mixed));
        assertDoesNotThrow(() -> EodClarificationAccessPolicy.requireCanReply(both, entry, mixed));
    }
}
