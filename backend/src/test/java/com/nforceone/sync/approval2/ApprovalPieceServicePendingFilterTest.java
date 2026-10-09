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
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
import com.nforceone.sync.utilization.UtilizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Verifies that PM pending only returns PM-type PROJECT_GROUPED pieces (not REPORTING_MANAGER),
 * and that decided-pieces methods scope correctly to PM vs REPORTING_MANAGER types.
 */
@ExtendWith(MockitoExtension.class)
class ApprovalPieceServicePendingFilterTest {

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

    private ApprovalPieceService service;

    private static final String PM_EMAIL = "pm@example.com";
    private static final String RM_EMAIL = "rm@example.com";

    private AppUser pm;
    private AppUser rm;
    private AppUser employee;

    @BeforeEach
    void setUp() {
        service = new ApprovalPieceService(
                pieceRepository, actionRepository, entryRepository,
                userRepository, utilizationService, notificationService,
                auditLogRepository, pmScopeService, logLineRepository, taskRepository,
                clarificationRepository);

        pm = user(20L, AppUser.Role.PM, "Bob PM", PM_EMAIL);
        rm = user(21L, AppUser.Role.PM, "Suhita RM", RM_EMAIL);
        employee = user(30L, AppUser.Role.EMPLOYEE, "Carol", "carol@example.com");

        lenient().when(logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(any())).thenReturn(List.of());
        lenient().when(taskRepository.findByEodEntryIdInWithDetails(any())).thenReturn(List.of());
    }

    // ── getPendingForActor — PM pending filter ────────────────────────────────

    @Test
    void pm_pending_queries_only_pm_type_pieces() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        EodProjectApproval pmPiece = projectPiece(1L, pm, EodProjectApproval.ApproverType.PM, EodEntry.EntryForm.PROJECT_GROUPED);
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(pmPiece));
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).approverType()).isEqualTo("PM");
        assertThat(result.get(0).entryForm()).isEqualTo("PROJECT_GROUPED");
    }

    @Test
    void pm_pending_excludes_reporting_manager_pieces() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        // REPORTING_MANAGER pieces should never appear in PM pending because we now filter
        // by approverType=PM in the query, not all pieces by approver_id.
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        // No pieces returned even if REPORTING_MANAGER pieces existed (they are not queried)
        assertThat(result).isEmpty();
    }

    @Test
    void pm_pending_includes_escalated_lead_pieces() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        EodProjectApproval escalatedPiece = projectPiece(2L, null, EodProjectApproval.ApproverType.LEAD, EodEntry.EntryForm.PROJECT_GROUPED);
        escalatedPiece.setEscalatedTo(pm);
        escalatedPiece.setEscalatedAt(OffsetDateTime.now(ZoneOffset.UTC));

        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(escalatedPiece));

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).escalatedAt()).isNotNull();
    }

    // ── getDecidedPmPieces ────────────────────────────────────────────────────

    @Test
    void getDecidedPmPieces_returns_pm_type_approved() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        EodProjectApproval approvedPiece = projectPiece(3L, pm, EodProjectApproval.ApproverType.PM, EodEntry.EntryForm.PROJECT_GROUPED);
        approvedPiece.setStatus(EodProjectApproval.Status.APPROVED);
        approvedPiece.setActedAt(OffsetDateTime.now(ZoneOffset.UTC));

        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of(approvedPiece));
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getDecidedPmPieces(PM_EMAIL, "APPROVED");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).status()).isEqualTo("APPROVED");
        assertThat(result.get(0).entryForm()).isEqualTo("PROJECT_GROUPED");
    }

    @Test
    void getDecidedPmPieces_includes_escalated_decided_pieces() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        EodProjectApproval decidedEscalated = projectPiece(4L, null, EodProjectApproval.ApproverType.LEAD, EodEntry.EntryForm.PROJECT_GROUPED);
        decidedEscalated.setStatus(EodProjectApproval.Status.APPROVED);
        decidedEscalated.setEscalatedTo(pm);
        decidedEscalated.setActedAt(OffsetDateTime.now(ZoneOffset.UTC));

        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of());
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of(decidedEscalated));

        List<ApprovalPieceDto> result = service.getDecidedPmPieces(PM_EMAIL, "APPROVED");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).escalatedToId()).isEqualTo(pm.getId());
    }

    // ── getDecidedReportingManagerPieces ─────────────────────────────────────

    @Test
    void getDecidedReportingManagerPieces_returns_rm_type_only() {
        when(userRepository.findByEmailAndDeletedAtIsNull(RM_EMAIL)).thenReturn(Optional.of(rm));

        EodProjectApproval rmPiece = plainLogPiece(5L, rm);
        rmPiece.setStatus(EodProjectApproval.Status.APPROVED);

        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                rm.getId(), EodProjectApproval.ApproverType.REPORTING_MANAGER, EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of(rmPiece));

        List<ApprovalPieceDto> result = service.getDecidedReportingManagerPieces(RM_EMAIL, "APPROVED");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).approverType()).isEqualTo("REPORTING_MANAGER");
        assertThat(result.get(0).entryForm()).isEqualTo("PLAIN_LOG");
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role, String name, String email) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        u.setFullName(name);
        u.setEmail(email);
        return u;
    }

    private EodProjectApproval projectPiece(Long id, AppUser approver,
                                             EodProjectApproval.ApproverType type,
                                             EodEntry.EntryForm form) {
        EodEntry e = new EodEntry();
        e.setId(id * 100);
        e.setEmployee(employee);
        e.setEntryDate(LocalDate.of(2026, 10, 6));
        e.setEntryForm(form);
        e.setStatus(EodProjectApproval.Status.PENDING == EodProjectApproval.Status.PENDING
                ? EodEntry.Status.SUBMITTED : EodEntry.Status.APPROVED);

        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setApprover(approver);
        p.setApproverType(type);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setFrozenAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setEodEntry(e);
        return p;
    }

    private EodProjectApproval plainLogPiece(Long id, AppUser approver) {
        EodEntry e = new EodEntry();
        e.setId(id * 100);
        e.setEmployee(employee);
        e.setEntryDate(LocalDate.of(2026, 10, 6));
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setStatus(EodEntry.Status.SUBMITTED);

        EodProjectApproval p = new EodProjectApproval();
        p.setId(id);
        p.setApprover(approver);
        p.setApproverType(EodProjectApproval.ApproverType.REPORTING_MANAGER);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setFrozenAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setEodEntry(e);
        return p;
    }
}
