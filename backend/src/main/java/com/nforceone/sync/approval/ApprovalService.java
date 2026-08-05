package com.nforceone.sync.approval;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.approval.dto.ApprovalActionDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.eod.dto.EodEntryEnrichment;
import com.nforceone.sync.notification.NotificationService;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.utilization.UtilizationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.time.LocalDateTime;
import java.time.LocalDate;

@Service
@Transactional
public class ApprovalService {

    private static final long BUSINESS_RULE_CONFIG_ID = 1L;
    private static final BigDecimal FALLBACK_HOURS_PER_DAY = BigDecimal.valueOf(8);
    private static final int FALLBACK_ESCALATION_SLA_HOURS = 48;

    private final EodEntryRepository     entryRepository;
    private final AppUserRepository      userRepository;
    private final ApprovalActionRepository actionRepository;
    private final AuditLogRepository     auditLogRepository;
    private final UtilizationService     utilizationService;
    private final ObjectMapper           objectMapper;
    private final NotificationService    notificationService;
    private final BusinessRuleConfigRepository configRepository;

    public ApprovalService(EodEntryRepository entryRepository,
                           AppUserRepository userRepository,
                           ApprovalActionRepository actionRepository,
                           AuditLogRepository auditLogRepository,
                           UtilizationService utilizationService,
                           ObjectMapper objectMapper,
                           NotificationService notificationService,
                           BusinessRuleConfigRepository configRepository) {
        this.entryRepository     = entryRepository;
        this.userRepository      = userRepository;
        this.actionRepository    = actionRepository;
        this.auditLogRepository  = auditLogRepository;
        this.utilizationService  = utilizationService;
        this.objectMapper        = objectMapper;
        this.notificationService = notificationService;
        this.configRepository    = configRepository;
    }

    // from/to are both null or both present — enforced by the controller, which only forwards
    // the pair when the caller supplied both query params. PM entries aren't date-scoped —
    // no PM+date repository query exists yet — so a PM actor always gets the full backlog.
    //
    // Team Lead (non-PM) entries DO support date-scoping via findPendingByManagerIdAndEntryDateBetween
    // — used when the caller supplies a range (e.g. the Team Dashboard's "Review approvals" count,
    // which should track whatever date is selected on the dashboard). Callers that omit the range
    // (the sidebar badge, and the Approvals page's own default view) get the full backlog via
    // findPendingByManagerId, unchanged — those are deliberately NOT date-scoped.
    @Transactional(readOnly = true)
    public List<EodEntryDto> getPendingForActor(String actorEmail, LocalDate from, LocalDate to) {
        AppUser actor = requireUserByEmail(actorEmail);
        if (actor.getRole() == AppUser.Role.PM) {
            List<EodEntry> entries = entryRepository.findPendingByProjectManagerId(actor.getId(), EodEntry.Status.SUBMITTED);
            return enrichAll(entries);
        }
        List<EodEntry> entries = (from != null && to != null)
                ? entryRepository.findPendingByManagerIdAndEntryDateBetween(actor.getId(), EodEntry.Status.SUBMITTED, from, to)
                : entryRepository.findPendingByManagerId(actor.getId(), EodEntry.Status.SUBMITTED);
        return entries.stream().map(EodEntryDto::from).toList();
    }

    /** Entries this actor has personally approved/rejected, for the Approved/Rejected tabs. */
    @Transactional(readOnly = true)
    public List<EodEntryDto> getDecidedForActor(String actorEmail, EodEntry.Status status) {
        AppUser actor = requireUserByEmail(actorEmail);
        if (actor.getRole() == AppUser.Role.PM) {
            List<EodEntry> entries = entryRepository.findDecidedByProjectManagerId(actor.getId(), status);
            return enrichAll(entries);
        }
        List<EodEntry> entries = entryRepository.findDecidedByManagerId(actor.getId(), status);
        return entries.stream().map(EodEntryDto::from).toList();
    }

    /** Full audit trail for one entry — every approve/reject/request-changes action, oldest first. */
    @Transactional(readOnly = true)
    public List<ApprovalActionDto> getHistory(Long entryId, String actorEmail) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = requireEntryById(entryId);
        checkManagerAuthorization(actor, entry);
        return actionRepository.findByEodEntryIdIn(List.of(entryId)).stream()
                .map(ApprovalActionDto::from)
                .toList();
    }

    public EodEntryDto approve(Long entryId, String actorEmail,
                               Boolean billableOverride, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = requireEntryById(entryId);
        return approveEntry(entry, actor, billableOverride, comment);
    }

    public EodEntryDto reject(Long entryId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = requireEntryById(entryId);
        checkManagerAuthorization(actor, entry);
        requireStatus(entry, EodEntry.Status.SUBMITTED);

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(entry, actor, ApprovalAction.Action.REJECT, comment, null, now);

        entry.setStatus(EodEntry.Status.REJECTED);
        entry.setUpdatedAt(now);
        entryRepository.save(entry);

        writeAudit(entry, "EOD_REJECTED", actor, now);
        notificationService.send(entry.getEmployee().getId(), "EOD_REJECTED",
                "EOD entry rejected",
                "Your EOD entry for " + entry.getEntryDate() + " was rejected."
                        + (comment != null && !comment.isBlank() ? " Comment: " + comment : ""),
                "/eod/submit?date=" + entry.getEntryDate());
        return EodEntryDto.from(entry);
    }

    public EodEntryDto requestChanges(Long entryId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = requireEntryById(entryId);
        checkManagerAuthorization(actor, entry);
        requireStatus(entry, EodEntry.Status.SUBMITTED);

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(entry, actor, ApprovalAction.Action.REQUEST_CHANGES, comment, null, now);

        entry.setStatus(EodEntry.Status.CHANGES_REQUESTED);
        entry.setUpdatedAt(now);
        entryRepository.save(entry);

        writeAudit(entry, "EOD_CHANGES_REQUESTED", actor, now);
        notificationService.send(entry.getEmployee().getId(), "EOD_CHANGES_REQUESTED",
                "Changes requested on EOD entry",
                "Your EOD entry for " + entry.getEntryDate() + " requires changes."
                        + (comment != null && !comment.isBlank() ? " Comment: " + comment : ""),
                "/eod/submit?date=" + entry.getEntryDate());
        return EodEntryDto.from(entry);
    }

    public List<EodEntryDto> batchApprove(List<Long> entryIds, String actorEmail) {
        AppUser actor = requireUserByEmail(actorEmail);
        return entryIds.stream()
                .map(id -> approveEntry(requireEntryById(id), actor, null, null))
                .toList();
    }

    // ── PM enrichment (escalation, undertime, TL, resubmission) ────────

    /**
     * Enriches a batch of entries in one extra query (all their ApprovalActions) instead of
     * one query per row. Only ever called for a PM's own views — the Team Lead's pending list
     * keeps calling {@code EodEntryDto::from(e)} unchanged.
     */
    private List<EodEntryDto> enrichAll(List<EodEntry> entries) {
        if (entries.isEmpty()) return List.of();

        BusinessRuleConfig config = configRepository.findById(BUSINESS_RULE_CONFIG_ID).orElse(null);
        int slaHours = config != null ? config.getEscalationSlaHours() : FALLBACK_ESCALATION_SLA_HOURS;
        BigDecimal standardHours = config != null ? config.getWorkingHoursPerDay() : FALLBACK_HOURS_PER_DAY;

        List<Long> entryIds = entries.stream().map(EodEntry::getId).toList();
        Map<Long, List<ApprovalAction>> actionsByEntry = actionRepository.findByEodEntryIdIn(entryIds).stream()
                .collect(Collectors.groupingBy(a -> a.getEodEntry().getId()));

        OffsetDateTime now = OffsetDateTime.now();
        return entries.stream()
                .map(e -> EodEntryDto.from(e, latestReviewerComment(actionsByEntry.get(e.getId())),
                        enrich(e, actionsByEntry.getOrDefault(e.getId(), List.of()), slaHours, standardHours, now)))
                .toList();
    }

    private EodEntryEnrichment enrich(EodEntry entry, List<ApprovalAction> actions,
                                       int slaHours, BigDecimal standardHours, OffsetDateTime now) {
        AppUser tl = entry.getEmployee().getManager();
        boolean isResubmission = actions.stream().anyMatch(a ->
                a.getAction() == ApprovalAction.Action.REJECT || a.getAction() == ApprovalAction.Action.REQUEST_CHANGES);

        boolean escalated;
        Integer tlInactivityHours = null;
        if (tl == null) {
            // No TL assigned — nobody to wait on, so escalate immediately.
            escalated = entry.getStatus() == EodEntry.Status.SUBMITTED;
        } else {
            boolean tlActed = actions.stream().anyMatch(a -> a.getActor().getId().equals(tl.getId()));
            long hoursSinceSubmit = entry.getSubmittedAt() == null
                    ? 0 : Duration.between(entry.getSubmittedAt(), now).toHours();
            escalated = entry.getStatus() == EodEntry.Status.SUBMITTED && !tlActed && hoursSinceSubmit >= slaHours;
            if (escalated) tlInactivityHours = (int) hoursSinceSubmit;
        }

        BigDecimal totalHours = entry.getTasks().stream()
                .map(EodTask::getHours).filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal undertimeHours = entry.getDayType() == EodEntry.DayType.WORKING_DAY
                ? standardHours.subtract(totalHours).max(BigDecimal.ZERO)
                : BigDecimal.ZERO;

        return new EodEntryEnrichment(
                escalated,
                tlInactivityHours,
                tl != null ? tl.getFullName() : null,
                tl != null ? tl.getId() : null,
                undertimeHours,
                isResubmission
        );
    }

    /** Most recent REJECT/REQUEST_CHANGES comment, or null if the entry has never been rejected/changes-requested. */
    private String latestReviewerComment(List<ApprovalAction> actions) {
        if (actions == null) return null;
        return actions.stream()
                .filter(a -> a.getAction() == ApprovalAction.Action.REJECT || a.getAction() == ApprovalAction.Action.REQUEST_CHANGES)
                .max(Comparator.comparing(ApprovalAction::getActedAt))
                .map(ApprovalAction::getComment)
                .orElse(null);
    }

    // ── private helpers ─────────────────────────────────────────────

    private EodEntryDto approveEntry(EodEntry entry, AppUser actor,
                                      Boolean billableOverride, String comment) {
        checkManagerAuthorization(actor, entry);
        requireStatus(entry, EodEntry.Status.SUBMITTED);

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(entry, actor, ApprovalAction.Action.APPROVE, comment, billableOverride, now);

        entry.setStatus(EodEntry.Status.APPROVED);
        entry.setUpdatedAt(now);
        entryRepository.save(entry);

        writeAudit(entry, "EOD_APPROVED", actor, now);
        utilizationService.recomputeForEntry(entry.getId());
        notificationService.send(entry.getEmployee().getId(), "EOD_APPROVED",
                "EOD entry approved",
                "Your EOD entry for " + entry.getEntryDate() + " has been approved.",
                "/eod/history");
        return EodEntryDto.from(entry);
    }

    private void checkManagerAuthorization(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;

        AppUser manager = entry.getEmployee().getManager();
        boolean isDirectManager = manager != null && manager.getId().equals(actor.getId());

        boolean isProjectManager = entry.getTasks().stream()
                .map(EodTask::getProject)
                .filter(Objects::nonNull)
                .map(Project::getPm)
                .filter(Objects::nonNull)
                .anyMatch(pm -> pm.getId().equals(actor.getId()));

        if (!isDirectManager && !isProjectManager) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the employee's direct manager or a project manager on this entry can perform this action");
        }
    }

    private void requireStatus(EodEntry entry, EodEntry.Status required) {
        if (entry.getStatus() != required) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Entry must be in " + required + " status; current: " + entry.getStatus());
        }
    }

    private void recordAction(EodEntry entry, AppUser actor,
                               ApprovalAction.Action action, String comment,
                               Boolean billableOverride, OffsetDateTime now) {
        ApprovalAction aa = new ApprovalAction();
        aa.setEodEntry(entry);
        aa.setActor(actor);
        aa.setAction(action);
        aa.setComment(comment);
        aa.setBillableOverride(billableOverride);
        aa.setActedAt(now);
        actionRepository.save(aa);
    }

    // Records employeeName + entryDate in afterValue so the admin dashboard's Recent
    // Activity panel can render "Approved [Name]'s EOD entry — [date]" instead of raw IDs.
    private void writeAudit(EodEntry entry, String action, AppUser actor, OffsetDateTime now) {
        AuditLog log = new AuditLog();
        log.setEntityType("EOD_ENTRY");
        log.setEntityId(entry.getId());
        log.setAction(action);
        log.setActor(actor);
        log.setAfterValue(objectMapper.writeValueAsString(Map.of(
                "employeeName", entry.getEmployee().getFullName(),
                "entryDate", entry.getEntryDate().toString()
        )));
        log.setOccurredAt(now);
        auditLogRepository.save(log);
    }

    private AppUser requireUserByEmail(String email) {
        return userRepository.findByEmailAndDeletedAtIsNull(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private EodEntry requireEntryById(Long id) {
        return entryRepository.findWithDetailsById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "EOD entry not found"));
    }
}
