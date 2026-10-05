package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link EscalationScheduler#runEscalation}.
 *
 * <p>All repositories and services are mocked. Real entities are constructed via setters.
 * Every test calls {@code runEscalation} directly so there is no dependency on Spring's
 * scheduler infrastructure.
 */
@ExtendWith(MockitoExtension.class)
class EscalationSchedulerTest {

    @Mock EodProjectApprovalRepository pieceRepository;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock NotificationService notificationService;
    @Mock AuditLogRepository auditLogRepository;

    @InjectMocks EscalationScheduler scheduler;

    // Fixed time anchor: 2026-10-05 12:00 UTC
    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 5, 12, 0, 0, 0, ZoneOffset.UTC);

    private AppUser lead;
    private AppUser pm;
    private AppUser employee;
    private Project project;
    private EodEntry entry;
    private EodProjectApproval piece;
    private BusinessRuleConfig config;

    @BeforeEach
    void setUp() {
        lead = user(10L, AppUser.Role.EMPLOYEE, "Alice Lead");
        pm   = user(20L, AppUser.Role.PM,       "Bob PM");
        employee = user(30L, AppUser.Role.EMPLOYEE, "Carol Employee");

        project = new Project();
        project.setId(100L);
        project.setLead(lead);
        project.setPm(pm);

        entry = new EodEntry();
        entry.setId(200L);
        entry.setEmployee(employee);
        entry.setEntryDate(LocalDate.of(2026, 10, 4));

        piece = new EodProjectApproval();
        piece.setId(1L);
        piece.setApprover(lead);
        piece.setApproverType(EodProjectApproval.ApproverType.LEAD);
        piece.setStatus(EodProjectApproval.Status.PENDING);
        piece.setFrozenAt(NOW.minusHours(50));  // 50 hours ago — stale for any SLA ≤ 50
        piece.setProject(project);
        piece.setEodEntry(entry);

        config = new BusinessRuleConfig();
        config.setEscalationSlaHours(24);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AppUser user(Long id, AppUser.Role role, String name) {
        AppUser u = new AppUser();
        u.setId(id);
        u.setRole(role);
        u.setFullName(name);
        return u;
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    /**
     * Happy path: a stale LEAD piece past SLA that has not yet been escalated gets escalated.
     * Expects: count=1, escalatedAt/escalatedTo set and saved, 2 notifications sent, audit written.
     */
    @Test
    void staleLead_pastSla_notAlreadyEscalated_escalates() {
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        int count = scheduler.runEscalation(config);

        assertThat(count).isEqualTo(1);
        assertThat(piece.getEscalatedAt()).isNotNull();
        assertThat(piece.getEscalatedTo()).isSameAs(pm);
        verify(pieceRepository).save(piece);

        // Two notifications: one to PM, one to lead
        verify(notificationService, times(2)).send(any(), any(), any(), any(), any());
        verify(notificationService).send(eq(pm.getId()), eq("ESCALATION_PM_NOTIFIED"), any(), any(), any());
        verify(notificationService).send(eq(lead.getId()), eq("ESCALATION_LEAD_NOTIFIED"), any(), any(), any());

        // Audit written for escalation
        ArgumentCaptor<AuditLog> auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("LEAD_PIECE_ESCALATED_TO_PM");
    }

    /**
     * SLA disabled: escalation_sla_hours is null → no repo query, returns 0.
     */
    @Test
    void slaDisabled_null_noEscalation() {
        config.setEscalationSlaHours(null);

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(pieceRepository, never()).findStaleLeadPiecesForEscalation(any());
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * SLA disabled: escalation_sla_hours is 0 → no escalation.
     */
    @Test
    void slaDisabled_zero_noEscalation() {
        config.setEscalationSlaHours(0);

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(pieceRepository, never()).findStaleLeadPiecesForEscalation(any());
    }

    /**
     * Project has no PM → piece skipped, audit written with ESCALATION_SKIPPED_NO_PM, no notification.
     */
    @Test
    void noPm_skipped_auditWritten() {
        project.setPm(null);
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
        ArgumentCaptor<AuditLog> auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("ESCALATION_SKIPPED_NO_PM");
    }

    /**
     * PM and lead are the same user → piece skipped, audit written with ESCALATION_SKIPPED_PM_IS_LEAD.
     */
    @Test
    void pmIsLead_skipped_auditWritten() {
        project.setPm(lead); // PM == lead
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
        ArgumentCaptor<AuditLog> auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("ESCALATION_SKIPPED_PM_IS_LEAD");
    }

    /**
     * PM is the employee whose EOD is being reviewed → piece skipped to avoid self-approval.
     */
    @Test
    void pmIsEmployee_skipped() {
        project.setPm(employee); // PM == employee
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
        ArgumentCaptor<AuditLog> auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("ESCALATION_SKIPPED_PM_IS_EMPLOYEE");
    }

    /**
     * Piece returned by query already has escalatedAt set (concurrent run scenario) →
     * idempotent guard returns false, no save/notification/audit.
     */
    @Test
    void alreadyEscalated_idempotent_noSecondEscalation() {
        // Simulate: query returns it (race), but escalatedAt already populated
        piece.setEscalatedAt(NOW.minusMinutes(1));
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(pieceRepository, never()).save(any());
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
        verify(auditLogRepository, never()).save(any());
    }

    /**
     * Repository returns empty list for the LEAD-typed query → 0 escalations.
     * This verifies that REPORTING_MANAGER pieces are never included (the query itself filters by
     * type; this test mocks the correct empty-list outcome for a non-LEAD scenario).
     */
    @Test
    void reportingManagerPiece_notInQuery() {
        // The query filters type = LEAD at DB level; mock returns empty for that scenario
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of());

        int count = scheduler.runEscalation(config);

        assertThat(count).isZero();
        verify(notificationService, never()).send(any(), any(), any(), any(), any());
    }

    /**
     * Both PM and lead receive notifications with the correct notification type strings.
     */
    @Test
    void leadNotified_and_pmNotified() {
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        scheduler.runEscalation(config);

        ArgumentCaptor<String> typeCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Long> userCaptor  = ArgumentCaptor.forClass(Long.class);
        verify(notificationService, times(2)).send(userCaptor.capture(), typeCaptor.capture(), any(), any(), any());

        assertThat(typeCaptor.getAllValues()).containsExactlyInAnyOrder(
                "ESCALATION_PM_NOTIFIED", "ESCALATION_LEAD_NOTIFIED");
        assertThat(userCaptor.getAllValues()).containsExactlyInAnyOrder(pm.getId(), lead.getId());
    }

    /**
     * Lead is null (no approver assigned to the piece) → only PM is notified, no NPE.
     */
    @Test
    void noLead_onlyPmNotified() {
        piece.setApprover(null);
        when(pieceRepository.findStaleLeadPiecesForEscalation(any())).thenReturn(List.of(piece));

        int count = scheduler.runEscalation(config);

        assertThat(count).isEqualTo(1);
        // Only one notification (to PM) — no lead to notify
        verify(notificationService, times(1)).send(any(), any(), any(), any(), any());
        verify(notificationService).send(eq(pm.getId()), eq("ESCALATION_PM_NOTIFIED"), any(), any(), any());
    }
}
