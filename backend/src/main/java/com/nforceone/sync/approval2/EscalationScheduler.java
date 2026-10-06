package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.notification.NotificationDates;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Hourly scheduler that escalates stale LEAD approval pieces to the project's PM.
 *
 * <p>A piece is stale when it has been PENDING for longer than
 * {@code business_rule_config.escalation_sla_hours}. Escalation sets
 * {@code escalated_at} and {@code escalated_to_id} on the piece, notifies both the PM and
 * the lead, and writes an audit entry. It is idempotent: a piece with a non-null
 * {@code escalated_at} is never touched again.
 *
 * <p>Escalation is disabled when {@code escalation_sla_hours} is null or ≤ 0.
 */
@Component
public class EscalationScheduler {

    private static final Logger log = LoggerFactory.getLogger(EscalationScheduler.class);
    private static final long CONFIG_ID = 1L;

    private final EodProjectApprovalRepository pieceRepository;
    private final BusinessRuleConfigRepository configRepository;
    private final NotificationService notificationService;
    private final AuditLogRepository auditLogRepository;

    public EscalationScheduler(EodProjectApprovalRepository pieceRepository,
                                BusinessRuleConfigRepository configRepository,
                                NotificationService notificationService,
                                AuditLogRepository auditLogRepository) {
        this.pieceRepository = pieceRepository;
        this.configRepository = configRepository;
        this.notificationService = notificationService;
        this.auditLogRepository = auditLogRepository;
    }

    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void escalateStalePieces() {
        BusinessRuleConfig config = configRepository.findById(CONFIG_ID).orElse(null);
        if (config == null) {
            log.warn("EscalationScheduler: business_rule_config id={} missing, skipping.", CONFIG_ID);
            return;
        }
        int escalated = runEscalation(config);
        if (escalated > 0) log.info("EscalationScheduler: escalated {} stale LEAD piece(s).", escalated);
    }

    /**
     * Public trigger for admin-only HTTP endpoint — loads config from DB and delegates to
     * {@link #runEscalation(BusinessRuleConfig)}.
     */
    @Transactional
    public int triggerNow() {
        BusinessRuleConfig config = configRepository.findById(CONFIG_ID).orElse(null);
        if (config == null) return 0;
        return runEscalation(config);
    }

    /**
     * Package-private for testing — runs escalation against the supplied config without the
     * scheduler's fixed cron gate.
     *
     * @return count of pieces actually escalated this call
     */
    @Transactional
    int runEscalation(BusinessRuleConfig config) {
        Integer slaHours = config.getEscalationSlaHours();
        if (slaHours == null || slaHours <= 0) {
            log.debug("EscalationScheduler: disabled (escalation_sla_hours={}).", slaHours);
            return 0;
        }

        OffsetDateTime cutoff = OffsetDateTime.now().minusHours(slaHours);
        List<EodProjectApproval> stale = pieceRepository.findStaleLeadPiecesForEscalation(cutoff);

        int count = 0;
        for (EodProjectApproval piece : stale) {
            if (tryEscalate(piece, config)) count++;
        }
        return count;
    }

    private boolean tryEscalate(EodProjectApproval piece, BusinessRuleConfig config) {
        // Idempotency guard — the query already filters escalated_at IS NULL, but protect
        // against a concurrent second call that loaded the list before the first committed.
        if (piece.getEscalatedAt() != null) return false;

        Project project = piece.getProject();
        if (project == null) {
            log.warn("EscalationScheduler: piece {} has no project — skipping.", piece.getId());
            return false;
        }

        AppUser pm = project.getPm();
        if (pm == null) {
            log.warn("EscalationScheduler: project {} has no PM — piece {} not escalated.",
                    project.getId(), piece.getId());
            writeAudit(piece, null, "ESCALATION_SKIPPED_NO_PM");
            return false;
        }

        AppUser lead = piece.getApprover();
        if (lead != null && pm.getId().equals(lead.getId())) {
            log.warn("EscalationScheduler: PM and lead are the same user ({}) for piece {} — skipping.",
                    pm.getId(), piece.getId());
            writeAudit(piece, pm, "ESCALATION_SKIPPED_PM_IS_LEAD");
            return false;
        }

        AppUser employee = piece.getEodEntry().getEmployee();
        if (pm.getId().equals(employee.getId())) {
            log.warn("EscalationScheduler: PM ({}) is the employee for piece {} — skipping.",
                    pm.getId(), piece.getId());
            writeAudit(piece, pm, "ESCALATION_SKIPPED_PM_IS_EMPLOYEE");
            return false;
        }

        OffsetDateTime now = OffsetDateTime.now();
        piece.setEscalatedAt(now);
        piece.setEscalatedTo(pm);
        pieceRepository.save(piece);
        writeAudit(piece, pm, "LEAD_PIECE_ESCALATED_TO_PM");

        String dateLabel = NotificationDates.format(piece.getEodEntry().getEntryDate());
        String leadName = lead != null ? lead.getFullName() : "the assigned lead";

        // Notify PM
        notificationService.send(pm.getId(), "ESCALATION_PM_NOTIFIED",
                "Approval escalated to you",
                employee.getFullName() + "'s EOD for " + dateLabel
                + " hasn't been reviewed by " + leadName + " within "
                + config.getEscalationSlaHours() + "h. Please act on it.",
                "/team/approvals");

        // Notify lead
        if (lead != null) {
            notificationService.send(lead.getId(), "ESCALATION_LEAD_NOTIFIED",
                    "Approval escalated to " + pm.getFullName(),
                    "Your pending approval for " + employee.getFullName() + "'s EOD (" + dateLabel
                    + ") has been escalated to " + pm.getFullName() + " after "
                    + config.getEscalationSlaHours() + "h.",
                    "/team/approvals");
        }

        return true;
    }

    private void writeAudit(EodProjectApproval piece, AppUser pm, String action) {
        AuditLog al = new AuditLog();
        al.setEntityType("EOD_PROJECT_APPROVAL");
        al.setEntityId(piece.getId());
        al.setAction(action);
        al.setActor(pm);
        al.setAfterValue("{\"escalatedToId\":" + (pm != null ? pm.getId() : "null") + "}");
        al.setOccurredAt(OffsetDateTime.now());
        auditLogRepository.save(al);
    }
}
