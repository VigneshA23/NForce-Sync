package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodClarificationRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTask;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Team Lead > Approvals: the Pending list holds only LEAD-type pieces the viewer approves (reporting-manager
 * pieces stay on My Reporting Team, and a lead who also manages a project still gets his lead pieces); the
 * Approved/Rejected tabs hold only entries where he decided a LEAD piece, scoped to his own projects.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ApprovalPieceServiceLeadScopeTest {

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
    private AppUser lead, leadPm, superAdmin, employee;
    private Project projA, projB;

    @BeforeEach
    void setUp() {
        service = new ApprovalPieceService(pieceRepository, actionRepository, entryRepository, userRepository,
                utilizationService, notificationService, auditLogRepository, pmScopeService, logLineRepository,
                taskRepository, clarificationRepository, new LeadTeamPolicy(null, projectRepository, null));

        lead       = user(1L, AppUser.Role.EMPLOYEE, "lead@example.com");
        leadPm     = user(2L, AppUser.Role.PM, "leadpm@example.com");   // a lead who also manages a project
        superAdmin = user(3L, AppUser.Role.SUPERADMIN, "sa@example.com");
        employee   = user(9L, AppUser.Role.EMPLOYEE, "akhila@example.com");
        for (AppUser u : List.of(lead, leadPm, superAdmin)) {
            when(userRepository.findByEmailAndDeletedAtIsNull(u.getEmail())).thenReturn(Optional.of(u));
        }
        when(pmScopeService.isProjectManager(leadPm)).thenReturn(true);
        projA = project(10L, "SYNC", lead);
        projB = project(20L, "ARENA", null);
        when(projectRepository.findByLeadIdOrderByNameAsc(lead.getId())).thenReturn(List.of(projA));
        when(logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(any())).thenReturn(List.of());
        when(taskRepository.findByEodEntryIdInWithDetails(any())).thenReturn(List.of());
    }

    private AppUser user(Long id, AppUser.Role role, String email) {
        AppUser u = new AppUser(); u.setId(id); u.setRole(role); u.setEmail(email); u.setFullName(email); return u;
    }

    private Project project(Long id, String code, AppUser lead) {
        Project p = new Project(); p.setId(id); p.setCode(code); p.setName(code); p.setLead(lead); return p;
    }

    private EodProjectApproval piece(Long id, AppUser approver, EodProjectApproval.ApproverType type, LocalDate date) {
        EodEntry e = new EodEntry();
        e.setId(id * 100);
        e.setEmployee(employee);
        e.setEntryDate(date);
        e.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        e.setStatus(EodEntry.Status.SUBMITTED);
        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setEodEntry(e);
        p.setApprover(approver);
        p.setApproverType(type);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setFrozenAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        return p;
    }

    private void leadPieces(AppUser who, EodProjectApproval... pieces) {
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                who.getId(), EodProjectApproval.ApproverType.LEAD, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(pieces));
    }

    // ── pending ───────────────────────────────────────────────────────────────

    @Test
    void pending_isLeadTypePiecesOnly_neverReportingManagerPieces() {
        leadPieces(lead, piece(1L, lead, EodProjectApproval.ApproverType.LEAD, LocalDate.of(2026, 10, 9)));

        List<ApprovalPieceDto> result = service.getLeadPendingPieces(lead.getEmail(), null, null);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).approverType()).isEqualTo("LEAD");
        verify(pieceRepository, never()).findByApproverIdAndStatus(any(), any());
        verify(pieceRepository, never()).findByApproverIdAndApproverTypeAndStatus(
                any(), org.mockito.ArgumentMatchers.eq(EodProjectApproval.ApproverType.REPORTING_MANAGER), any());
    }

    @Test
    void pending_aLeadWhoAlsoManagesAProject_stillGetsHisLeadPieces() {
        leadPieces(leadPm, piece(2L, leadPm, EodProjectApproval.ApproverType.LEAD, LocalDate.of(2026, 10, 9)));

        assertThat(service.getLeadPendingPieces(leadPm.getEmail(), null, null)).hasSize(1);
    }

    @Test
    void pending_dateRangeNarrowsByEntryDate_forTheDashboardKpi() {
        leadPieces(lead,
                piece(3L, lead, EodProjectApproval.ApproverType.LEAD, LocalDate.of(2026, 10, 9)),
                piece(4L, lead, EodProjectApproval.ApproverType.LEAD, LocalDate.of(2026, 10, 12)));

        List<ApprovalPieceDto> result = service.getLeadPendingPieces(
                lead.getEmail(), LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 12));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).entryDate()).isEqualTo(LocalDate.of(2026, 10, 12));
    }

    @Test
    void pending_superAdminKeepsTheExistingSystemWideView() {
        when(pieceRepository.findAllByStatus(EodProjectApproval.Status.PENDING)).thenReturn(List.of());

        assertThat(service.getLeadPendingPieces(superAdmin.getEmail(), null, null)).isEmpty();
        verify(pieceRepository).findAllByStatus(EodProjectApproval.Status.PENDING);
    }

    // ── approved / rejected ───────────────────────────────────────────────────

    @Test
    void decided_isLeadPiecesOnly_andScopedToHisProjects() {
        EodEntry shared = new EodEntry();
        shared.setId(700L);
        shared.setEmployee(employee);
        shared.setEntryDate(LocalDate.of(2026, 10, 9));
        shared.setStatus(EodEntry.Status.APPROVED);
        shared.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        shared.getTasks().add(task(1L, projA, "4.00", "Sync work"));
        shared.getTasks().add(task(2L, projB, "3.00", "Arena secret"));
        when(entryRepository.findByLeadApproverPieceStatus(lead.getId(), EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of(shared));

        List<EodEntryDto> result = service.getDecidedEntriesForActor(lead.getEmail(), "APPROVED");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).tasks()).extracting(t -> t.projectCode()).containsExactly("SYNC");
        assertThat(result.get(0).otherProjectsHours()).isEqualByComparingTo("3.00");
        // The unscoped, any-piece-type query (which let reporting-manager entries leak in) is not used.
        verify(entryRepository, never()).findByApproverPieceStatus(any(), any());
    }

    private EodTask task(Long id, Project p, String hours, String description) {
        EodTask t = new EodTask();
        t.setId(id); t.setProject(p); t.setHours(new BigDecimal(hours)); t.setDescription(description);
        return t;
    }
}
