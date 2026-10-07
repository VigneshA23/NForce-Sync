package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodLogLineRepository;
import com.nforceone.sync.eod.EodTaskRepository;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.utilization.UtilizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Gap 2: approve() and reject() must notify the employee for PROJECT_GROUPED pieces,
 * including the project name and the rejection comment.
 */
@ExtendWith(MockitoExtension.class)
class ApprovalPieceNotificationTest {

    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock EodProjectApprovalActionRepository actionRepository;
    @Mock EodEntryRepository entryRepository;
    @Mock AppUserRepository userRepository;
    @Mock UtilizationService utilizationService;
    @Mock NotificationService notificationService;
    @Mock AuditLogRepository auditLogRepository;
    @Mock EodLogLineRepository logLineRepository;
    @Mock EodTaskRepository taskRepository;

    @InjectMocks ApprovalPieceService service;

    private static final String ACTOR_EMAIL = "lead@example.com";

    private AppUser actor;
    private AppUser employee;
    private EodEntry entry;
    private EodProjectApproval piece;
    private Project project;

    @BeforeEach
    void setUp() {
        lenient().when(logLineRepository.findByEntryIdOrderBySortOrderAscIdAsc(any()))
                .thenReturn(List.of());
        lenient().when(taskRepository.findByEodEntryIdInWithDetails(any())).thenReturn(List.of());

        actor = user(10L, AppUser.Role.EMPLOYEE, "Vignesh A", ACTOR_EMAIL);
        employee = user(20L, AppUser.Role.EMPLOYEE, "Akhila S", "akhila@example.com");

        project = new Project();
        project.setId(1L);
        project.setName("Nforce Sync");

        entry = new EodEntry();
        entry.setId(200L);
        entry.setEmployee(employee);
        entry.setEntryDate(LocalDate.of(2026, 9, 4));
        entry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        entry.setStatus(EodEntry.Status.SUBMITTED);

        piece = new EodProjectApproval();
        piece.setId(1L);
        piece.setApprover(actor);
        piece.setApproverType(EodProjectApproval.ApproverType.LEAD);
        piece.setStatus(EodProjectApproval.Status.PENDING);
        piece.setProject(project);
        piece.setFrozenAt(OffsetDateTime.of(2026, 9, 3, 12, 0, 0, 0, ZoneOffset.UTC));
        piece.setCreatedAt(OffsetDateTime.of(2026, 9, 3, 12, 0, 0, 0, ZoneOffset.UTC));
        piece.setEodEntry(entry);
    }

    private AppUser user(Long id, AppUser.Role role, String name, String email) {
        AppUser u = new AppUser();
        u.setId(id); u.setRole(role); u.setFullName(name); u.setEmail(email);
        return u;
    }

    private void stubForApprove() {
        when(userRepository.findByEmailAndDeletedAtIsNull(ACTOR_EMAIL)).thenReturn(Optional.of(actor));
        when(pieceRepository.findById(1L)).thenReturn(Optional.of(piece));
        when(pieceRepository.findByEodEntryId(entry.getId())).thenReturn(List.of(piece));
        when(entryRepository.save(any())).thenReturn(entry);
        when(actionRepository.save(any())).thenReturn(null);
    }

    // ── approve ────────────────────────────────────────────────────────────────

    @Test
    void approve_projectGrouped_notifiesEmployeeWithProjectName() {
        stubForApprove();

        service.approve(1L, ACTOR_EMAIL, null);

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService).send(
                eq(20L), eq("EOD_APPROVED"), contains("Nforce Sync"), bodyCaptor.capture(), anyString());
        assertTrue(bodyCaptor.getValue().contains("Nforce Sync"),
                "Body should contain project name: " + bodyCaptor.getValue());
        assertTrue(bodyCaptor.getValue().contains("Vignesh A"),
                "Body should name the approver: " + bodyCaptor.getValue());
    }

    @Test
    void approve_plainLog_notifiesWithDailyLogLabel() {
        entry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        piece.setApproverType(EodProjectApproval.ApproverType.REPORTING_MANAGER);
        stubForApprove();

        service.approve(1L, ACTOR_EMAIL, null);

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService).send(
                eq(20L), eq("EOD_APPROVED"), eq("Daily log approved"), bodyCaptor.capture(), anyString());
        assertTrue(bodyCaptor.getValue().contains("daily log"),
                "PLAIN_LOG body should say 'daily log': " + bodyCaptor.getValue());
    }

    // ── reject ─────────────────────────────────────────────────────────────────

    @Test
    void reject_projectGrouped_notifiesEmployeeWithProjectNameAndComment() {
        when(userRepository.findByEmailAndDeletedAtIsNull(ACTOR_EMAIL)).thenReturn(Optional.of(actor));
        when(pieceRepository.findById(1L)).thenReturn(Optional.of(piece));
        when(pieceRepository.findByEodEntryId(entry.getId())).thenReturn(List.of(piece));
        when(entryRepository.save(any())).thenReturn(entry);
        when(actionRepository.save(any())).thenReturn(null);

        service.reject(1L, ACTOR_EMAIL, "Too vague — please detail the specific tasks.");

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService).send(
                eq(20L), eq("EOD_REJECTED"), contains("Nforce Sync"), bodyCaptor.capture(), anyString());
        String body = bodyCaptor.getValue();
        assertTrue(body.contains("Nforce Sync"), "body missing project: " + body);
        assertTrue(body.contains("Too vague"), "body missing rejection comment: " + body);
    }

    @Test
    void reject_plainLog_notifiesWithReasonAndDailyLogLabel() {
        entry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        piece.setApproverType(EodProjectApproval.ApproverType.REPORTING_MANAGER);
        when(userRepository.findByEmailAndDeletedAtIsNull(ACTOR_EMAIL)).thenReturn(Optional.of(actor));
        when(pieceRepository.findById(1L)).thenReturn(Optional.of(piece));
        when(pieceRepository.findByEodEntryId(entry.getId())).thenReturn(List.of(piece));
        when(entryRepository.save(any())).thenReturn(entry);
        when(actionRepository.save(any())).thenReturn(null);

        service.reject(1L, ACTOR_EMAIL, "Missing hours");

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationService).send(
                eq(20L), eq("EOD_REJECTED"), eq("Daily log rejected"), bodyCaptor.capture(), anyString());
        assertTrue(bodyCaptor.getValue().contains("Missing hours"));
    }

    @Test
    void approve_projectGrouped_noAuditLogWritten() {
        stubForApprove();

        service.approve(1L, ACTOR_EMAIL, null);

        // PROJECT_GROUPED approval does NOT write the old PLAIN_LOG_APPROVED audit log
        verify(auditLogRepository, never()).save(any());
    }
}
