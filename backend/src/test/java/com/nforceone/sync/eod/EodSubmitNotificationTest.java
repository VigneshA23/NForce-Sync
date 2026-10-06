package com.nforceone.sync.eod;

import com.nforceone.sync.approval2.ApprovalPieceSpec;
import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

/**
 * Unit tests for Gap 1: submit notifications reach each distinct piece approver.
 *
 * EodService.notifySubmitApprovers is private — tested via ReflectionTestUtils so the
 * core notification logic can be verified without standing up the full submit() method.
 */
@ExtendWith(MockitoExtension.class)
class EodSubmitNotificationTest {

    @Mock NotificationService notificationService;

    /** Minimal EodService stub — only the notification collaborator is wired. */
    private EodService service;

    @BeforeEach
    void setUp() {
        // Constructor order: entryRepo, taskRepo, userRepo, projectRepo, categoryRepo,
        // actionRepo, configRepo, shiftRepo, holidayRepo, attachmentService,
        // notificationService, approvalPieceRouter, projectApprovalRepo,
        // accessPolicy, leadAccess, allocationRepo, auditLogRepo
        service = new EodService(null, null, null, null, null, null, null, null, null, null,
                notificationService, null, null, null, null, null, null);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private AppUser user(Long id, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setFullName(name);
        return u;
    }

    private Project project(Long id, String name) {
        Project p = new Project();
        p.setId(id);
        p.setName(name);
        return p;
    }

    private EodEntry entry(Long id, LocalDate date) {
        EodEntry e = new EodEntry();
        e.setId(id);
        e.setEntryDate(date);
        return e;
    }

    private ApprovalPieceSpec spec(AppUser approver, Project proj, EodProjectApproval.ApproverType type) {
        return new ApprovalPieceSpec(proj, approver, type, EodProjectApproval.Status.PENDING);
    }

    private void invokeNotify(List<ApprovalPieceSpec> specs, AppUser employee, EodEntry saved) {
        ReflectionTestUtils.invokeMethod(service, "notifySubmitApprovers", specs, employee, saved);
    }

    // ── tests ──────────────────────────────────────────────────────────────────

    @Test
    void singleLeadApprover_receivesOneNotification() {
        AppUser lead = user(10L, "Vignesh A");
        AppUser employee = user(20L, "Akhila S");
        Project sync = project(1L, "Nforce Sync");
        EodEntry saved = entry(100L, LocalDate.of(2026, 9, 4));

        List<ApprovalPieceSpec> specs = List.of(
                spec(lead, sync, EodProjectApproval.ApproverType.LEAD));

        invokeNotify(specs, employee, saved);

        verify(notificationService, times(1)).send(
                eq(10L), eq("EOD_SUBMITTED"), anyString(), contains("Nforce Sync"), anyString());
    }

    @Test
    void twoProjectsSameApprover_receivesOneNotification() {
        AppUser rm = user(30L, "Dheeraj S");
        AppUser employee = user(20L, "Vignesh A");
        Project sync = project(1L, "Nforce Sync");
        Project onehr = project(2L, "Nforce OneHR");
        EodEntry saved = entry(101L, LocalDate.of(2026, 9, 4));

        List<ApprovalPieceSpec> specs = List.of(
                spec(rm, sync, EodProjectApproval.ApproverType.REPORTING_MANAGER),
                spec(rm, onehr, EodProjectApproval.ApproverType.REPORTING_MANAGER));

        invokeNotify(specs, employee, saved);

        verify(notificationService, times(1)).send(eq(30L), eq("EOD_SUBMITTED"), anyString(), anyString(), anyString());
        // Message must mention both projects
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService).send(eq(30L), eq("EOD_SUBMITTED"), anyString(), bodyCaptor.capture(), anyString());
        assertTrue(bodyCaptor.getValue().contains("Nforce OneHR"));
        assertTrue(bodyCaptor.getValue().contains("Nforce Sync"));
    }

    @Test
    void twoProjectsDifferentApprovers_eachReceivesOne() {
        AppUser lead = user(10L, "Vignesh A");
        AppUser rm = user(30L, "Dheeraj S");
        AppUser employee = user(20L, "Akhila S");
        Project sync = project(1L, "Nforce Sync");
        Project onehr = project(2L, "Nforce OneHR");
        EodEntry saved = entry(102L, LocalDate.of(2026, 9, 4));

        List<ApprovalPieceSpec> specs = List.of(
                spec(lead, sync, EodProjectApproval.ApproverType.LEAD),
                spec(rm, onehr, EodProjectApproval.ApproverType.REPORTING_MANAGER));

        invokeNotify(specs, employee, saved);

        verify(notificationService, times(1)).send(eq(10L), eq("EOD_SUBMITTED"), anyString(), anyString(), anyString());
        verify(notificationService, times(1)).send(eq(30L), eq("EOD_SUBMITTED"), anyString(), anyString(), anyString());
        verifyNoMoreInteractions(notificationService);
    }

    @Test
    void autoApprovedPiece_noNotification() {
        AppUser employee = user(20L, "Akhila S");
        Project sync = project(1L, "Nforce Sync");
        EodEntry saved = entry(103L, LocalDate.of(2026, 9, 4));

        // AUTO_APPROVED spec still has a non-null approver field in some routes; must be skipped
        ApprovalPieceSpec autoSpec = new ApprovalPieceSpec(
                sync, user(99L, "Someone"), EodProjectApproval.ApproverType.AUTO_APPROVED, EodProjectApproval.Status.APPROVED);

        invokeNotify(List.of(autoSpec), employee, saved);

        verifyNoInteractions(notificationService);
    }

    @Test
    void nullApprover_noNotification() {
        AppUser employee = user(20L, "Akhila S");
        Project sync = project(1L, "Nforce Sync");
        EodEntry saved = entry(104L, LocalDate.of(2026, 9, 4));

        ApprovalPieceSpec noApprover = new ApprovalPieceSpec(sync, null,
                EodProjectApproval.ApproverType.ADMIN_GROUP, EodProjectApproval.Status.PENDING);

        invokeNotify(List.of(noApprover), employee, saved);

        verifyNoInteractions(notificationService);
    }
}
