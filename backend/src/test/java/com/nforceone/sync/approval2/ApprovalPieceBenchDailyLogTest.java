package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.eod.EodClarificationRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.PmScopeService;
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
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Bench Log approval flow (V117). A bench-mode EMPLOYEE Daily Log is a PLAIN_LOG entry, so it is routed to the
 * employee's reporting manager exactly like every other Daily Log, and approving it is what triggers the
 * utilization recompute ("Decision 8" in ApprovalPieceService). Every other PLAIN_LOG entry still does not.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ApprovalPieceBenchDailyLogTest {

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
    private AppUser rm, employee;

    @BeforeEach
    void setUp() {
        service = new ApprovalPieceService(pieceRepository, actionRepository, entryRepository, userRepository,
                utilizationService, notificationService, auditLogRepository, pmScopeService, logLineRepository,
                taskRepository, clarificationRepository, new LeadTeamPolicy(null, null, null));
        rm = user(1L, AppUser.Role.EMPLOYEE, "rm@example.com");          // a Reporting Manager is not a role
        employee = user(9L, AppUser.Role.EMPLOYEE, "newhire@example.com");
        employee.setManager(rm);
        when(userRepository.findByEmailAndDeletedAtIsNull(rm.getEmail())).thenReturn(Optional.of(rm));
        when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(anyLong())).thenReturn(List.of());
        when(clarificationRepository.existsByPiece_IdAndStatusNot(any(), any())).thenReturn(false);
    }

    private static AppUser user(Long id, AppUser.Role role, String email) {
        AppUser u = new AppUser(); u.setId(id); u.setRole(role); u.setEmail(email); u.setFullName(email);
        return u;
    }

    private EodEntry dailyLog(boolean benchMode) {
        EodEntry e = new EodEntry();
        e.setId(700L);
        e.setEmployee(employee);
        e.setEntryDate(LocalDate.of(2026, 10, 9));
        e.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        e.setStatus(EodEntry.Status.SUBMITTED);
        e.setDayType(EodEntry.DayType.WORKING_DAY);
        e.setLogTotalHours(new BigDecimal("8.00"));
        e.setBenchMode(benchMode);
        return e;
    }

    private EodProjectApproval pendingRmPiece(EodEntry e) {
        EodProjectApproval p = new EodProjectApproval();
        p.setId(55L);
        p.setEodEntry(e);
        p.setApprover(rm);
        p.setApproverType(EodProjectApproval.ApproverType.REPORTING_MANAGER);
        p.setStatus(EodProjectApproval.Status.PENDING);
        p.setFrozenAt(OffsetDateTime.now());
        p.setCreatedAt(OffsetDateTime.now());
        when(pieceRepository.findById(55L)).thenReturn(Optional.of(p));
        when(pieceRepository.findByEodEntryId(700L)).thenReturn(List.of(p));
        return p;
    }

    // ── routing: the entry reaches a reviewer, with no project and no Team Lead ──

    @Test
    void benchDailyLog_routesToTheEmployeesReportingManager_asOnePendingPiece() {
        List<ApprovalPieceSpec> specs = new ApprovalPieceRouter().route(dailyLog(true), new BusinessRuleConfig());

        assertEquals(1, specs.size());
        ApprovalPieceSpec spec = specs.get(0);
        assertEquals(EodProjectApproval.ApproverType.REPORTING_MANAGER, spec.approverType());
        assertEquals(EodProjectApproval.Status.PENDING, spec.status());
        assertEquals(rm.getId(), spec.approver().getId());
        assertEquals(null, spec.project()); // no project, so no Team Lead and no PM to be missing
    }

    @Test
    void benchDailyLog_withNoReportingManager_fallsBackToTheAdminGroup_notStuck() {
        employee.setManager(null);

        List<ApprovalPieceSpec> specs = new ApprovalPieceRouter().route(dailyLog(true), new BusinessRuleConfig());

        assertEquals(EodProjectApproval.ApproverType.ADMIN_GROUP, specs.get(0).approverType());
        assertEquals(EodProjectApproval.Status.PENDING, specs.get(0).status());
    }

    // ── approval recomputes the snapshot for a bench entry, and only for it ───

    @Test
    void approvingABenchDailyLog_recomputesTheSnapshot() {
        EodEntry e = dailyLog(true);
        EodProjectApproval piece = pendingRmPiece(e);

        service.approve(piece.getId(), rm.getEmail(), null);

        assertEquals(EodProjectApproval.Status.APPROVED, piece.getStatus());
        assertEquals(EodEntry.Status.APPROVED, e.getStatus());
        verify(utilizationService).recomputeForEntry(700L);
    }

    @Test
    void approvingANonBenchDailyLog_doesNotRecompute_asBefore() {
        EodEntry e = dailyLog(false);
        EodProjectApproval piece = pendingRmPiece(e);

        service.approve(piece.getId(), rm.getEmail(), null);

        verify(utilizationService, never()).recomputeForEntry(anyLong());
    }

    @Test
    void approvingAPmsDailyLog_doesNotRecompute_asBefore() {
        EodEntry e = dailyLog(false);
        employee.setRole(AppUser.Role.PM);
        EodProjectApproval piece = pendingRmPiece(e);

        service.approve(piece.getId(), rm.getEmail(), null);

        verify(utilizationService, never()).recomputeForEntry(anyLong());
    }

    @Test
    void rejectingABenchDailyLog_doesNotWriteASnapshot_soNoBenchHoursAreCounted() {
        EodEntry e = dailyLog(true);
        EodProjectApproval piece = pendingRmPiece(e);

        service.reject(piece.getId(), rm.getEmail(), "Please add detail");

        assertEquals(EodEntry.Status.REJECTED, e.getStatus());
        assertNotNull(piece.getActedAt());
        verify(utilizationService, never()).recomputeForEntry(anyLong());
    }
}
