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
import com.nforceone.sync.eod.dto.OtherProjectStatusDto;
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
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * An employee on two projects with different Team Leads submits one EOD, split into one piece per project.
 * Status is per project, per lead: each lead's card, tab and badge follow HIS piece, never the entry's
 * aggregate status (where any rejection wins) and never the other lead's decision.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ApprovalPieceServiceSplitStatusTest {

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
    private AppUser syncLead, arenaLead, employee;
    private Project sync, arena;

    @BeforeEach
    void setUp() {
        service = new ApprovalPieceService(pieceRepository, actionRepository, entryRepository, userRepository,
                utilizationService, notificationService, auditLogRepository, pmScopeService, logLineRepository,
                taskRepository, clarificationRepository, new LeadTeamPolicy(null, projectRepository, null));

        syncLead  = user(1L, "sync.lead@example.com");
        arenaLead = user(2L, "arena.lead@example.com");
        employee  = user(9L, "sravani@example.com");
        for (AppUser u : List.of(syncLead, arenaLead)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        sync  = project(10L, "SYNC", syncLead);
        arena = project(20L, "ARENA", arenaLead);
        when(projectRepository.findByLeadIdOrderByNameAsc(syncLead.getId())).thenReturn(List.of(sync));
        when(projectRepository.findByLeadIdOrderByNameAsc(arenaLead.getId())).thenReturn(List.of(arena));
        when(logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(any())).thenReturn(List.of());
        when(taskRepository.findByEodEntryIdInWithDetails(any())).thenReturn(List.of());
    }

    private AppUser user(Long id, String email) {
        AppUser u = new AppUser(); u.setId(id); u.setRole(AppUser.Role.EMPLOYEE); u.setEmail(email); u.setFullName(email);
        return u;
    }

    private Project project(Long id, String code, AppUser lead) {
        Project p = new Project(); p.setId(id); p.setCode(code); p.setName(code); p.setLead(lead); return p;
    }

    private EodEntry entry(Long id, EodEntry.Status aggregate) {
        EodEntry e = new EodEntry();
        e.setId(id);
        e.setEmployee(employee);
        e.setEntryDate(LocalDate.of(2026, 10, 9));
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        e.setStatus(aggregate);
        return e;
    }

    private EodProjectApproval piece(Long id, EodEntry e, Project p, AppUser approver, EodProjectApproval.Status status) {
        EodProjectApproval pc = new EodProjectApproval();
        pc.setId(id);
        pc.setEodEntry(e);
        pc.setProject(p);
        pc.setApprover(approver);
        pc.setApproverType(EodProjectApproval.ApproverType.LEAD);
        pc.setStatus(status);
        pc.setFrozenAt(OffsetDateTime.now(ZoneOffset.UTC));
        pc.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        return pc;
    }

    private void decidedFor(AppUser lead, EodProjectApproval.Status status, EodEntry... entries) {
        when(entryRepository.findByLeadApproverPieceStatus(lead.getId(), status)).thenReturn(List.of(entries));
    }

    // ── one lead approves, the other rejects ──────────────────────────────────

    @Test
    void approvingLeadSeesApproved_rejectingLeadSeesRejected_badgeAndTabCounts() {
        // The entry's aggregate status is REJECTED (any rejection wins) — neither lead's badge may use it.
        EodEntry e = entry(700L, EodEntry.Status.REJECTED);
        EodProjectApproval syncPiece  = piece(1L, e, sync, syncLead, EodProjectApproval.Status.APPROVED);
        EodProjectApproval arenaPiece = piece(2L, e, arena, arenaLead, EodProjectApproval.Status.REJECTED);
        when(pieceRepository.findByEodEntryId(700L)).thenReturn(List.of(syncPiece, arenaPiece));
        decidedFor(syncLead,  EodProjectApproval.Status.APPROVED, e);
        decidedFor(arenaLead, EodProjectApproval.Status.REJECTED, e);

        List<EodEntryDto> syncApproved  = service.getDecidedEntriesForActor(syncLead.getEmail(), "APPROVED");
        List<EodEntryDto> syncRejected  = service.getDecidedEntriesForActor(syncLead.getEmail(), "REJECTED");
        List<EodEntryDto> arenaApproved = service.getDecidedEntriesForActor(arenaLead.getEmail(), "APPROVED");
        List<EodEntryDto> arenaRejected = service.getDecidedEntriesForActor(arenaLead.getEmail(), "REJECTED");

        // SYNC lead: Approved tab holds it with an Approved badge; nothing in Rejected.
        assertThat(syncApproved).hasSize(1);
        assertThat(syncApproved.get(0).status()).isEqualTo("APPROVED");
        assertThat(syncApproved.get(0).otherProjectStatuses())
                .containsExactly(new OtherProjectStatusDto("ARENA", "REJECTED"));
        assertThat(syncRejected).isEmpty();

        // ARENA lead: Rejected tab holds it with a Rejected badge; nothing in Approved.
        assertThat(arenaRejected).hasSize(1);
        assertThat(arenaRejected.get(0).status()).isEqualTo("REJECTED");
        assertThat(arenaRejected.get(0).otherProjectStatuses())
                .containsExactly(new OtherProjectStatusDto("SYNC", "APPROVED"));
        assertThat(arenaApproved).isEmpty();
    }

    @Test
    void pendingLeadStillSeesItInPending_whileTheOtherLeadHasDecided() {
        EodEntry e = entry(710L, EodEntry.Status.REJECTED);
        EodProjectApproval syncPiece  = piece(3L, e, sync, syncLead, EodProjectApproval.Status.PENDING);
        EodProjectApproval arenaPiece = piece(4L, e, arena, arenaLead, EodProjectApproval.Status.REJECTED);
        when(pieceRepository.findByEodEntryId(710L)).thenReturn(List.of(syncPiece, arenaPiece));
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                syncLead.getId(), EodProjectApproval.ApproverType.LEAD, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(syncPiece));

        List<ApprovalPieceDto> pending = service.getLeadPendingPieces(syncLead.getEmail(), null, null);

        assertThat(pending).hasSize(1);
        assertThat(pending.get(0).status()).isEqualTo("PENDING");
        // Not in either decided tab for the pending lead.
        assertThat(service.getDecidedEntriesForActor(syncLead.getEmail(), "APPROVED")).isEmpty();
        assertThat(service.getDecidedEntriesForActor(syncLead.getEmail(), "REJECTED")).isEmpty();
    }

    // ── single project is unchanged ───────────────────────────────────────────

    @Test
    void singleProjectEntry_keepsItsStatus_andCarriesNoOtherProjectChips() {
        EodEntry e = entry(720L, EodEntry.Status.APPROVED);
        when(pieceRepository.findByEodEntryId(720L))
                .thenReturn(List.of(piece(5L, e, sync, syncLead, EodProjectApproval.Status.APPROVED)));
        decidedFor(syncLead, EodProjectApproval.Status.APPROVED, e);

        List<EodEntryDto> result = service.getDecidedEntriesForActor(syncLead.getEmail(), "APPROVED");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).status()).isEqualTo("APPROVED");
        assertThat(result.get(0).otherProjectStatuses()).isEmpty();
    }

    // ── a lead cannot act on another project's piece ─────────────────────────

    @Test
    void leadCannotApproveOrRejectAnotherLeadsPiece() {
        EodEntry e = entry(730L, EodEntry.Status.SUBMITTED);
        EodProjectApproval arenaPiece = piece(6L, e, arena, arenaLead, EodProjectApproval.Status.PENDING);
        when(pieceRepository.findById(6L)).thenReturn(Optional.of(arenaPiece));

        assertThatThrownBy(() -> service.approve(6L, syncLead.getEmail(), null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> service.reject(6L, syncLead.getEmail(), "no"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");

        assertThat(arenaPiece.getStatus()).isEqualTo(EodProjectApproval.Status.PENDING);
        verify(pieceRepository, never()).save(any());
    }
}
