package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodClarificationRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.ProjectRepository;
import com.nforceone.sync.teamlead.LeadTeamPolicy;
import com.nforceone.sync.utilization.UtilizationService;
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
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * PM scoping on the approval pieces, against a small in-memory piece store (the repository answers apply
 * the same predicates as the JPQL they stand in for): PM A vs PM B isolation in the Pending tab, escalation
 * reaching only the project's PM, what the Team Lead sees once the PM decides, the legacy entry-level
 * endpoints routed through the piece rule, and one user who is lead + PM + reporting manager.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PmScopeIsolationTest {

    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock EodProjectApprovalActionRepository actionRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilizationService utilizationService;
    @Mock NotificationService notificationService;
    @Mock AuditLogRepository auditLogRepository;
    @Mock PmScopeService pmScopeService;
    @Mock EodLogLineRepository logLineRepository;
    @Mock EodTaskRepository taskRepository;
    @Mock EodClarificationRepository clarificationRepository;
    @Mock ProjectRepository projectRepository;

    private ApprovalPieceService service;
    private final List<EodProjectApproval> store = new ArrayList<>();
    private final List<EodEntry> entries = new ArrayList<>();

    private AppUser pmA, pmB, lead, employee, dheeraj;
    private Project projectA, projectB;

    @BeforeEach
    void setUp() {
        service = new ApprovalPieceService(pieceRepository, actionRepository, entryRepository, userRepository,
                utilizationService, notificationService, auditLogRepository, pmScopeService, logLineRepository,
                taskRepository, clarificationRepository, new LeadTeamPolicy(null, projectRepository, null));

        pmA      = user(1L, AppUser.Role.PM, "pma@example.com");
        pmB      = user(2L, AppUser.Role.PM, "pmb@example.com");
        lead     = user(3L, AppUser.Role.EMPLOYEE, "lead@example.com");
        employee = user(9L, AppUser.Role.EMPLOYEE, "akhila@example.com");
        dheeraj  = user(4L, AppUser.Role.EMPLOYEE, "dheeraj@example.com");   // PM + lead + RM, role EMPLOYEE
        for (AppUser u : List.of(pmA, pmB, lead, employee, dheeraj)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        when(pmScopeService.isProjectManager(any())).thenAnswer(inv -> {
            AppUser u = inv.getArgument(0);
            return u.getRole() == AppUser.Role.PM || u.getId().equals(dheeraj.getId());
        });
        projectA = project(10L, "A", lead, pmA);
        projectB = project(20L, "B", lead, pmB);
        when(projectRepository.findByLeadIdOrderByNameAsc(lead.getId())).thenReturn(List.of(projectA, projectB));

        when(pieceRepository.findById(anyLong())).thenAnswer(inv ->
                store.stream().filter(p -> p.getId().equals(inv.getArgument(0))).findFirst());
        when(pieceRepository.findByEodEntryId(anyLong())).thenAnswer(inv ->
                store.stream().filter(p -> p.getEodEntry().getId().equals(inv.getArgument(0))
                        && p.getSupersededAt() == null).toList());
        when(pieceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(actionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(entryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(entryRepository.findWithDetailsById(anyLong())).thenAnswer(inv ->
                entries.stream().filter(e -> e.getId().equals(inv.getArgument(0))).findFirst());
        // The queries the service leans on, with the predicates read from the repositories' JPQL.
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(any(), any(), any())).thenAnswer(inv -> {
            Long approver = inv.getArgument(0);
            EodProjectApproval.ApproverType type = inv.getArgument(1);
            EodProjectApproval.Status status = inv.getArgument(2);
            return store.stream().filter(p -> p.getApprover() != null && p.getApprover().getId().equals(approver)
                    && p.getApproverType() == type && p.getStatus() == status && p.getSupersededAt() == null).toList();
        });
        when(pieceRepository.findByEscalatedToIdAndStatus(any(), any())).thenAnswer(inv -> {
            Long to = inv.getArgument(0);
            EodProjectApproval.Status status = inv.getArgument(1);
            return store.stream().filter(p -> p.getEscalatedTo() != null && p.getEscalatedTo().getId().equals(to)
                    && p.getStatus() == status && p.getSupersededAt() == null).toList();
        });
        // EodEntryRepository.findByLeadApproverPieceStatus: EXISTS piece (approver = :id, LEAD, status, current cycle).
        when(entryRepository.findByLeadApproverPieceStatus(any(), any())).thenAnswer(inv -> {
            Long approver = inv.getArgument(0);
            EodProjectApproval.Status status = inv.getArgument(1);
            return store.stream().filter(p -> p.getApprover() != null && p.getApprover().getId().equals(approver)
                            && p.getApproverType() == EodProjectApproval.ApproverType.LEAD
                            && p.getStatus() == status && p.getSupersededAt() == null)
                    .map(EodProjectApproval::getEodEntry).distinct().toList();
        });
        when(logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(any())).thenReturn(List.of());
        when(taskRepository.findByEodEntryIdInWithDetails(any())).thenReturn(List.of());
    }

    // ── fixtures ──────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role, String email) {
        AppUser u = new AppUser(); u.setId(id); u.setRole(role); u.setEmail(email); u.setFullName(email); return u;
    }

    private static Project project(Long id, String code, AppUser lead, AppUser pm) {
        Project p = new Project(); p.setId(id); p.setCode(code); p.setName(code); p.setLead(lead); p.setPm(pm); return p;
    }

    private EodEntry entry(long id, AppUser who) {
        EodEntry e = new EodEntry();
        e.setId(id);
        e.setEmployee(who);
        e.setEntryDate(LocalDate.of(2026, 10, 9));
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        e.setStatus(EodEntry.Status.SUBMITTED);
        entries.add(e);
        return e;
    }

    private EodProjectApproval piece(long id, EodEntry e, Project project, AppUser approver,
                                      EodProjectApproval.ApproverType type) {
        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setEodEntry(e);
        p.setProject(project);
        p.setApprover(approver);
        p.setApproverType(type);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setFrozenAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        store.add(p);
        return p;
    }

    private EodProjectApproval escalate(EodProjectApproval p, AppUser to) {
        p.setEscalatedTo(to);
        p.setEscalatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        return p;
    }

    private static List<Long> ids(List<ApprovalPieceDto> list) {
        return list.stream().map(ApprovalPieceDto::id).toList();
    }

    // ── PM A vs PM B: each sees only what is escalated / assigned to him ──────

    @Test
    void escalatedPiece_appearsInTheProjectsPmPending_andNotInAnotherPms() {
        EodProjectApproval onA = escalate(piece(1L, entry(100, employee), projectA, lead, EodProjectApproval.ApproverType.LEAD), pmA);
        EodProjectApproval onB = escalate(piece(2L, entry(200, employee), projectB, lead, EodProjectApproval.ApproverType.LEAD), pmB);

        assertThat(ids(service.getPendingForActor(pmA.getEmail()))).containsExactly(onA.getId());
        assertThat(ids(service.getPendingForActor(pmB.getEmail()))).containsExactly(onB.getId());
    }

    @Test
    void anUnescalatedLeadPiece_isInNeitherPmsPending() {
        piece(1L, entry(100, employee), projectA, lead, EodProjectApproval.ApproverType.LEAD);

        assertThat(service.getPendingForActor(pmA.getEmail())).isEmpty();
        assertThat(service.getPendingForActor(pmB.getEmail())).isEmpty();
    }

    @Test
    void aDirectPmPiece_forAProjectWithNoLead_isInThatPmsPending_only() {
        EodProjectApproval direct = piece(1L, entry(100, employee), projectA, pmA, EodProjectApproval.ApproverType.PM);

        assertThat(ids(service.getPendingForActor(pmA.getEmail()))).containsExactly(direct.getId());
        assertThat(service.getPendingForActor(pmB.getEmail())).isEmpty();
    }

    @Test
    void pmCannotDecideAnotherPmsEscalatedPiece_byId() {
        EodProjectApproval onB = escalate(piece(2L, entry(200, employee), projectB, lead, EodProjectApproval.ApproverType.LEAD), pmB);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.approve(onB.getId(), pmA.getEmail(), null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertThat(onB.getStatus()).isEqualTo(EodProjectApproval.Status.PENDING);
    }

    // ── the PM decides an escalated piece; what the Team Lead then sees ───────

    @Test
    void afterThePmApprovesAnEscalatedPiece_theTlNoLongerHasItPending_butFindsItUnderApproved() {
        EodProjectApproval p = escalate(piece(1L, entry(100, employee), projectA, lead, EodProjectApproval.ApproverType.LEAD), pmA);
        assertThat(ids(service.getLeadPendingPieces(lead.getEmail(), null, null))).containsExactly(p.getId());   // still his, flagged escalated

        service.approve(p.getId(), pmA.getEmail(), "ok");

        assertThat(p.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
        assertThat(service.getLeadPendingPieces(lead.getEmail(), null, null)).isEmpty();
        List<EodEntryDto> tlApproved = service.getDecidedEntriesForActor(lead.getEmail(), "APPROVED");
        assertThat(tlApproved).extracting(EodEntryDto::id).containsExactly(100L);
        assertThat(service.getDecidedEntriesForActor(lead.getEmail(), "REJECTED")).isEmpty();
        // ... and the PM's own Approved tab holds it too.
        assertThat(ids(service.getDecidedPmPieces(pmA.getEmail(), "APPROVED"))).containsExactly(p.getId());
    }

    @Test
    void afterThePmRejectsAnEscalatedPiece_itMovesToRejected_forBothThePmAndTheTl() {
        EodProjectApproval p = escalate(piece(1L, entry(100, employee), projectA, lead, EodProjectApproval.ApproverType.LEAD), pmA);

        service.reject(p.getId(), pmA.getEmail(), "wrong project");

        assertThat(service.getLeadPendingPieces(lead.getEmail(), null, null)).isEmpty();
        assertThat(service.getDecidedEntriesForActor(lead.getEmail(), "REJECTED")).extracting(EodEntryDto::id).containsExactly(100L);
        assertThat(ids(service.getDecidedPmPieces(pmA.getEmail(), "REJECTED"))).containsExactly(p.getId());
        assertThat(service.getPendingForActor(pmA.getEmail())).isEmpty();
    }

    // ── the legacy /api/approvals endpoints now use the same piece rule ───────

    @Test
    void legacyApprove_aPmOnAnUnescalatedPiece_is403_andNothingChanges() {
        EodEntry e = entry(100, employee);
        EodProjectApproval p = piece(1L, e, projectA, lead, EodProjectApproval.ApproverType.LEAD);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.decideEntryPieces(e.getId(), pmA.getEmail(), true, null));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertThat(p.getStatus()).isEqualTo(EodProjectApproval.Status.PENDING);
        assertThat(e.getStatus()).isEqualTo(EodEntry.Status.SUBMITTED);
    }

    @Test
    void legacyApprove_aPmOnAnEscalatedPiece_decidesIt_andTheEntryStatusFollowsThePieces() {
        EodEntry e = entry(100, employee);
        EodProjectApproval p = escalate(piece(1L, e, projectA, lead, EodProjectApproval.ApproverType.LEAD), pmA);

        service.decideEntryPieces(e.getId(), pmA.getEmail(), true, null);

        assertThat(p.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
        assertThat(e.getStatus()).isEqualTo(EodEntry.Status.APPROVED);
    }

    @Test
    void legacyApprove_neverMarksAnEntryApproved_whenAPieceIsStillPending() {
        EodEntry e = entry(100, employee);
        EodProjectApproval mine = piece(1L, e, projectA, lead, EodProjectApproval.ApproverType.LEAD);
        EodProjectApproval other = piece(2L, e, projectB, pmB, EodProjectApproval.ApproverType.PM);

        service.decideEntryPieces(e.getId(), lead.getEmail(), true, null);

        assertThat(mine.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
        assertThat(other.getStatus()).isEqualTo(EodProjectApproval.Status.PENDING);
        assertThat(e.getStatus()).isEqualTo(EodEntry.Status.PARTIALLY_APPROVED);
    }

    @Test
    void legacyApprove_selfApprovalIsClosed() {
        EodEntry own = entry(300, pmA);
        piece(5L, own, projectB, pmA, EodProjectApproval.ApproverType.PM);   // routed to himself, somehow

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.decideEntryPieces(own.getId(), pmA.getEmail(), true, null));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertTrue(ex.getReason().contains("own EOD"), ex.getReason());
        assertThat(own.getStatus()).isEqualTo(EodEntry.Status.SUBMITTED);
    }

    @Test
    void legacyApprove_anEntryWithNoPendingPieces_is409_notASilentStatusFlip() {
        EodEntry e = entry(100, employee);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.decideEntryPieces(e.getId(), lead.getEmail(), true, null));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertThat(e.getStatus()).isEqualTo(EodEntry.Status.SUBMITTED);
    }

    @Test
    void legacyReject_needsAComment() {
        EodEntry e = entry(100, employee);
        piece(1L, e, projectA, lead, EodProjectApproval.ApproverType.LEAD);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.decideEntryPieces(e.getId(), lead.getEmail(), false, " "));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    // ── one user: PM of some projects, Team Lead of others, RM of some people ─

    @Test
    void leadPlusPmPlusRm_eachListHoldsOnlyItsOwnPieces_withNoDuplicates() {
        // Dheeraj leads project L, is PM of project M (escalation + one direct PM piece) and RM of Ravi.
        Project led = project(30L, "L", dheeraj, pmA);
        Project managed = project(40L, "M", lead, dheeraj);
        when(projectRepository.findByLeadIdOrderByNameAsc(dheeraj.getId())).thenReturn(List.of(led));

        EodProjectApproval asLead = piece(1L, entry(100, employee), led, dheeraj, EodProjectApproval.ApproverType.LEAD);
        EodProjectApproval escalatedToHim = escalate(piece(2L, entry(200, employee), managed, lead, EodProjectApproval.ApproverType.LEAD), dheeraj);
        EodProjectApproval directPm = piece(3L, entry(300, employee), managed, dheeraj, EodProjectApproval.ApproverType.PM);
        EodProjectApproval asRm = piece(4L, entry(400, employee), null, dheeraj, EodProjectApproval.ApproverType.REPORTING_MANAGER);

        List<Long> leadSection = ids(service.getLeadPendingPieces(dheeraj.getEmail(), null, null));
        List<Long> projectsSection = ids(service.getPendingForActor(dheeraj.getEmail()));
        List<Long> rmSection = ids(service.getPendingReportingManagerPieces(dheeraj.getId()));

        assertThat(leadSection).containsExactly(asLead.getId());
        assertThat(projectsSection).containsExactlyInAnyOrder(escalatedToHim.getId(), directPm.getId());
        assertThat(rmSection).containsExactly(asRm.getId());
        // no piece appears in two sections
        List<Long> all = new ArrayList<>();
        all.addAll(leadSection); all.addAll(projectsSection); all.addAll(rmSection);
        assertThat(all).doesNotHaveDuplicates();
    }

    @Test
    void theSameUser_canDecideThePieceHeHoldsAsLead_andThePieceEscalatedToHimAsPm() {
        Project led = project(30L, "L", dheeraj, pmA);
        Project managed = project(40L, "M", lead, dheeraj);
        EodProjectApproval asLead = piece(1L, entry(100, employee), led, dheeraj, EodProjectApproval.ApproverType.LEAD);
        EodProjectApproval escalatedToHim = escalate(piece(2L, entry(200, employee), managed, lead, EodProjectApproval.ApproverType.LEAD), dheeraj);
        EodProjectApproval notHis = escalate(piece(3L, entry(300, employee), projectB, lead, EodProjectApproval.ApproverType.LEAD), pmB);

        service.approve(asLead.getId(), dheeraj.getEmail(), null);
        service.approve(escalatedToHim.getId(), dheeraj.getEmail(), null);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.approve(notHis.getId(), dheeraj.getEmail(), null));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        assertThat(asLead.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
        assertThat(escalatedToHim.getStatus()).isEqualTo(EodProjectApproval.Status.APPROVED);
        assertThat(notHis.getStatus()).isEqualTo(EodProjectApproval.Status.PENDING);
    }
}
