package com.nforceone.sync.eod;

import com.nforceone.sync.approval.ApprovalActionRepository;
import com.nforceone.sync.approval.ApprovalService;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.utilization.UtilizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Verifies that the ApprovalService.enrich() PLAIN_LOG guard prevents plain-log
 * entries from being marked as "Escalated" when there is no Team Lead assigned.
 *
 * Before the fix: if (tl == null) escalated = status == SUBMITTED — fired for PLAIN_LOG
 * entries too, causing PM/Admin daily logs to show "Escalated to PM" in EOD Status.
 * After the fix: PLAIN_LOG entries always produce escalated=false.
 */
@ExtendWith(MockitoExtension.class)
class PlainLogEscalationEnrichTest {

    @Mock EodEntryRepository          entryRepository;
    @Mock AppUserRepository           userRepository;
    @Mock ApprovalActionRepository    actionRepository;
    @Mock AuditLogRepository          auditLogRepository;
    @Mock UtilizationService          utilizationService;
    @Mock ObjectMapper                objectMapper;
    @Mock NotificationService         notificationService;
    @Mock BusinessRuleConfigRepository configRepository;
    @Mock EodAttachmentService        attachmentService;
    @Mock EodClarificationRepository  clarificationRepository;

    private ApprovalService service;
    private AppUser pm;
    private EodEntry plainLogEntry;

    @BeforeEach
    void setUp() {
        service = new ApprovalService(
                entryRepository, userRepository, actionRepository, auditLogRepository,
                utilizationService, objectMapper, notificationService,
                configRepository, attachmentService, clarificationRepository);

        pm = new AppUser();
        pm.setId(10L);
        pm.setRole(AppUser.Role.PM);
        pm.setFullName("Suryateja PM");
        pm.setEmail("suryateja@example.com");
        pm.setManager(null); // no reporting manager

        plainLogEntry = new EodEntry();
        plainLogEntry.setId(1L);
        plainLogEntry.setEmployee(pm);
        plainLogEntry.setEntryDate(LocalDate.of(2026, 10, 6));
        plainLogEntry.setEntryForm(EodEntry.EntryForm.PLAIN_LOG);
        plainLogEntry.setStatus(EodEntry.Status.SUBMITTED);
        plainLogEntry.setSubmittedAt(OffsetDateTime.now().minusHours(72)); // well past SLA
        plainLogEntry.setManagerId(null); // no TL

        BusinessRuleConfig config = new BusinessRuleConfig();
        config.setWorkingHoursPerDay(BigDecimal.valueOf(8));
        config.setEscalationSlaHours(48);
        config.setNonProjectAutoApproveHours(BigDecimal.valueOf(2));

        when(userRepository.findByEmailAndDeletedAtIsNull("suryateja@example.com"))
                .thenReturn(Optional.of(pm));
        when(configRepository.findById(any())).thenReturn(Optional.of(config));
        when(entryRepository.findByPmIdAndStatus(pm.getId(), EodEntry.Status.SUBMITTED))
                .thenReturn(List.of(plainLogEntry));
        when(actionRepository.findByEodEntryIdIn(any())).thenReturn(List.of());
        when(attachmentService.loadForEntries(any()))
                .thenReturn(new EodAttachmentService.AttachmentsByScope(Map.of(), Map.of()));
    }

    @Test
    void plain_log_submitted_with_no_tl_is_not_escalated() {
        List<EodEntryDto> result = service.getPendingForActor("suryateja@example.com", null, null);

        assertThat(result).hasSize(1);
        EodEntryDto dto = result.get(0);
        assertThat(dto.escalated()).as("PLAIN_LOG entry must never be escalated=true").isFalse();
        assertThat(dto.tlInactivityHours()).as("tlInactivityHours must be null for PLAIN_LOG").isNull();
    }

    @Test
    void project_grouped_with_no_tl_submitted_past_sla_is_escalated() {
        // Verify the escalation logic still fires for PROJECT_GROUPED entries with no TL.
        EodEntry projectEntry = new EodEntry();
        projectEntry.setId(2L);
        projectEntry.setEmployee(pm);
        projectEntry.setEntryDate(LocalDate.of(2026, 10, 5));
        projectEntry.setEntryForm(EodEntry.EntryForm.PROJECT_GROUPED);
        projectEntry.setStatus(EodEntry.Status.SUBMITTED);
        projectEntry.setSubmittedAt(OffsetDateTime.now().minusHours(72));
        projectEntry.setManagerId(null);

        when(entryRepository.findByPmIdAndStatus(pm.getId(), EodEntry.Status.SUBMITTED))
                .thenReturn(List.of(projectEntry));

        List<EodEntryDto> result = service.getPendingForActor("suryateja@example.com", null, null);

        assertThat(result).hasSize(1);
        // PROJECT_GROUPED with no TL and status=SUBMITTED must remain escalated=true
        assertThat(result.get(0).escalated()).as("PROJECT_GROUPED with no TL still escalates").isTrue();
    }
}
