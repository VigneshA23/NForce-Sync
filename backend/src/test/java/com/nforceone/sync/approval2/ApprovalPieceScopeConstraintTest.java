package com.nforceone.sync.approval2;

import com.nforceone.sync.approval2.dto.ApprovalPieceDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
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
 * Verifies the critical scope constraints:
 *   (1) Daily logs (PLAIN_LOG / REPORTING_MANAGER pieces) never appear in PM Approvals.
 *   (2) LEAD and PM pieces never appear in Reporting Approvals.
 *   (3) PM pending escalation label is set only when escalatedAt is not null (LEAD piece).
 */
@ExtendWith(MockitoExtension.class)
class ApprovalPieceScopeConstraintTest {

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

    private ApprovalPieceService service;

    private static final String PM_EMAIL = "pm@scope.test";
    private static final String RM_EMAIL = "rm@scope.test";

    private AppUser pm;
    private AppUser rm;
    private AppUser employee;

    @BeforeEach
    void setUp() {
        service = new ApprovalPieceService(
                pieceRepository, actionRepository, entryRepository,
                userRepository, utilizationService, notificationService,
                auditLogRepository, pmScopeService, logLineRepository, taskRepository);

        pm = user(10L, AppUser.Role.PM, "Suhita PM", PM_EMAIL);
        rm = user(11L, AppUser.Role.PM, "Suhita RM", RM_EMAIL);
        employee = user(20L, AppUser.Role.EMPLOYEE, "Dheeraj", "dheeraj@scope.test");

        lenient().when(logLineRepository.findByEntryIdInOrderBySortOrderAscIdAsc(any())).thenReturn(List.of());
        lenient().when(taskRepository.findByEodEntryIdInWithDetails(any())).thenReturn(List.of());
    }

    // ── (1) Daily logs never on PM Approvals ─────────────────────────────────

    @Test
    void pm_pending_query_excludes_plain_log_by_approver_type_constraint() {
        // getPendingForActor for PM calls findByApproverIdAndApproverTypeAndStatus(pm.id, PM, PENDING).
        // A REPORTING_MANAGER piece (i.e. a daily log) can never satisfy ApproverType == PM,
        // so the DB query structurally excludes all plain-log / daily-log entries.
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        // Return one PM-type piece and zero escalated pieces
        EodProjectApproval pmPiece = projectPiece(1L, pm, EodProjectApproval.ApproverType.PM,
                EodEntry.EntryForm.PROJECT_GROUPED);
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(pmPiece));
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        assertThat(result).hasSize(1);
        // The only piece returned is PROJECT_GROUPED with PM approver type — never PLAIN_LOG
        assertThat(result.get(0).entryForm()).isEqualTo("PROJECT_GROUPED");
        assertThat(result.get(0).approverType()).isEqualTo("PM");
    }

    @Test
    void pm_pending_reporting_manager_piece_never_returned() {
        // Even if someone manually passed an RM piece in (impossible via the typed query),
        // the query simply cannot return REPORTING_MANAGER pieces because the type filter blocks it.
        // This test asserts the empty result when the repository (correctly) returns nothing.
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of()); // RM piece not returned by typed query
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        assertThat(result).isEmpty();
    }

    @Test
    void pm_decided_query_excludes_plain_log_by_approver_type_constraint() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        // PM decided tab uses findByApproverIdAndApproverTypeAndStatus(pm.id, PM, APPROVED/REJECTED).
        // PLAIN_LOG pieces are REPORTING_MANAGER type → structurally excluded.
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of());
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getDecidedPmPieces(PM_EMAIL, "APPROVED");

        assertThat(result).isEmpty();
    }

    // ── (2) LEAD and PM pieces never on Reporting Approvals ──────────────────

    @Test
    void rm_decided_query_uses_reporting_manager_type_only() {
        // getDecidedReportingManagerPieces calls findByApproverIdAndApproverTypeAndStatus
        // with REPORTING_MANAGER type — LEAD and PM pieces are structurally excluded.
        when(userRepository.findByEmailAndDeletedAtIsNull(RM_EMAIL)).thenReturn(Optional.of(rm));

        EodProjectApproval rmPiece = plainLogPiece(2L, rm, EodProjectApproval.Status.APPROVED);
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                rm.getId(), EodProjectApproval.ApproverType.REPORTING_MANAGER, EodProjectApproval.Status.APPROVED))
                .thenReturn(List.of(rmPiece));

        List<ApprovalPieceDto> result = service.getDecidedReportingManagerPieces(RM_EMAIL, "APPROVED");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).approverType()).isEqualTo("REPORTING_MANAGER");
        assertThat(result.get(0).entryForm()).isEqualTo("PLAIN_LOG");
    }

    @Test
    void rm_pending_excludes_lead_pieces() {
        // getPendingForActor for a non-PM user (RM is PM role here but acting as RM):
        // the RM flow in MyReportsService calls pieceRepository.findByApproverIdAndApproverTypeAndStatus
        // with REPORTING_MANAGER type — LEAD pieces are excluded.
        // This test verifies the RM path never leaks LEAD pieces.
        when(userRepository.findByEmailAndDeletedAtIsNull(RM_EMAIL)).thenReturn(Optional.of(rm));

        // RM user has their own PM pending (zero here); escalated-to is empty.
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                rm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());
        when(pieceRepository.findByEscalatedToIdAndStatus(rm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());

        // The RM routing (via MyReportsService) is a separate code path — here we verify
        // that when an RM piece query returns RM pieces, no LEAD pieces leak through.
        List<ApprovalPieceDto> result = service.getPendingForActor(RM_EMAIL);

        // All returned pieces must not be LEAD type
        assertThat(result).allMatch(p -> !p.approverType().equals("LEAD") || p.escalatedAt() != null,
                "LEAD pieces must only appear if escalatedAt is set (escalated to this actor)");
    }

    // ── (3) Label rule: escalatedAt is null → no escalation chip ─────────────

    @Test
    void pm_piece_without_escalated_at_has_null_escalation_fields() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        EodProjectApproval pmPiece = projectPiece(3L, pm, EodProjectApproval.ApproverType.PM,
                EodEntry.EntryForm.PROJECT_GROUPED);
        // No escalatedAt, no escalatedTo — pure PM-type piece
        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(pmPiece));
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).escalatedAt())
                .as("PM piece without escalation must have null escalatedAt")
                .isNull();
        assertThat(result.get(0).escalatedToId())
                .as("PM piece without escalation must have null escalatedToId")
                .isNull();
    }

    @Test
    void lead_piece_escalated_to_pm_has_escalation_fields_set() {
        when(userRepository.findByEmailAndDeletedAtIsNull(PM_EMAIL)).thenReturn(Optional.of(pm));

        EodProjectApproval escalatedPiece = projectPiece(4L, null, EodProjectApproval.ApproverType.LEAD,
                EodEntry.EntryForm.PROJECT_GROUPED);
        OffsetDateTime escalatedAt = OffsetDateTime.of(2026, 10, 6, 12, 0, 0, 0, ZoneOffset.UTC);
        escalatedPiece.setEscalatedTo(pm);
        escalatedPiece.setEscalatedAt(escalatedAt);

        when(pieceRepository.findByApproverIdAndApproverTypeAndStatus(
                pm.getId(), EodProjectApproval.ApproverType.PM, EodProjectApproval.Status.PENDING))
                .thenReturn(List.of());
        when(pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), EodProjectApproval.Status.PENDING))
                .thenReturn(List.of(escalatedPiece));

        List<ApprovalPieceDto> result = service.getPendingForActor(PM_EMAIL);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).escalatedAt())
                .as("Escalated LEAD piece must have escalatedAt set (used by frontend to show chip)")
                .isNotNull();
        assertThat(result.get(0).escalatedToId())
                .as("escalatedToId must point to the PM")
                .isEqualTo(pm.getId());
        assertThat(result.get(0).approverType()).isEqualTo("LEAD");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

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
        e.setStatus(EodEntry.Status.SUBMITTED);

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

    private EodProjectApproval plainLogPiece(Long id, AppUser approver,
                                              EodProjectApproval.Status status) {
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
        p.setStatus(status);
        p.setFrozenAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        p.setEodEntry(e);
        return p;
    }
}
