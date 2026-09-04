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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

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
            List<EodEntry> entries = entryRepository.findByProjectManagerIdAndStatus(actor.getId(), EodEntry.Status.SUBMITTED);
            return enrichAll(entries);
        }
        List<EodEntry> entries = (from != null && to != null)
                ? entryRepository.findPendingByManagerIdAndEntryDateBetween(actor.getId(), EodEntry.Status.SUBMITTED, from, to)
                : entryRepository.findPendingByManagerId(actor.getId(), EodEntry.Status.SUBMITTED);
        // Enriched for the Team Lead too, not just the PM: without it isResubmission is always
        // false, so a rejected entry the employee then fixed and resubmitted came back into the
        // TL's pending list looking like a first-time submission with no trace of the rejection.
        return enrichAll(entries);
    }

    /**
     * Entries for the Approved/Rejected tabs. For a Team Lead, scoped to their own direct
     * reports' entries they personally decided. For a PM, broader: every entry touching a
     * project they own at this status, regardless of who (them or the entry's Team Lead) decided
     * it — a PM oversees every team on their projects, not just their own actions.
     */
    @Transactional(readOnly = true)
    public List<EodEntryDto> getDecidedForActor(String actorEmail, EodEntry.Status status) {
        AppUser actor = requireUserByEmail(actorEmail);
        if (actor.getRole() == AppUser.Role.PM) {
            // Deliberately NOT scoped to actions this PM personally took — a PM oversees every
            // team touching their projects, so Approved/Rejected must include entries a Team
            // Lead decided too. See findByProjectManagerIdAndStatus's javadoc.
            List<EodEntry> entries = entryRepository.findByProjectManagerIdAndStatus(actor.getId(), status);
            return enrichAll(entries);
        }
        List<EodEntry> entries = entryRepository.findDecidedByManagerId(actor.getId(), status);
        return enrichAll(entries);
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

    public EodEntryDto approve(Long entryId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = requireEntryById(entryId);
        checkManagerAuthorization(actor, entry);
        requireStatus(entry, EodEntry.Status.SUBMITTED);
        return approveEntry(entry, actor, comment);
    }

    public EodEntryDto reject(Long entryId, String actorEmail, String comment) {
        AppUser actor = requireUserByEmail(actorEmail);
        EodEntry entry = requireEntryById(entryId);
        checkManagerAuthorization(actor, entry);
        requireStatus(entry, EodEntry.Status.SUBMITTED);

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(entry, actor, ApprovalAction.Action.REJECT, comment, now);

        entry.setStatus(EodEntry.Status.REJECTED);
        entry.setUpdatedAt(now);
        entryRepository.save(entry);

        writeAudit(entry, "EOD_REJECTED", actor, now);
        notificationService.send(entry.getEmployee().getId(), "EOD_REJECTED",
                "EOD entry rejected",
                "Your EOD entry for " + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate()) + " was rejected."
                        + (comment != null && !comment.isBlank() ? " Comment: " + comment : ""),
                "/eod/submit?date=" + entry.getEntryDate());
        return EodEntryDto.from(entry);
    }

    // requestChanges() removed in V44 — reject() covers it. A rejected entry is editable and
    // resubmittable, which is all "changes requested" ever did.

    // Entries not yet SUBMITTED (already decided elsewhere) are silently skipped rather than
    // aborting the whole batch — a TL clicking "Approve all" expects the ready ones to go
    // through. checkManagerAuthorization inside approveEntry still throws hard for an
    // unauthorized entry that otherwise passed this filter.
    public List<EodEntryDto> batchApprove(List<Long> entryIds, String actorEmail) {
        AppUser actor = requireUserByEmail(actorEmail);
        return entryIds.stream()
                .map(this::requireEntryById)
                .filter(entry -> entry.getStatus() == EodEntry.Status.SUBMITTED)
                .map(entry -> approveEntry(entry, actor, null))
                .toList();
    }

    // ── Enrichment (escalation, undertime, TL, resubmission) ────────

    /**
     * Enriches a batch of entries in one extra query (all their ApprovalActions) instead of
     * one query per row.
     *
     * Used for BOTH the PM's and the Team Lead's views. It was PM-only, which meant
     * isResubmission never reached the Team Lead and a resubmitted-after-rejection entry was
     * indistinguishable from a first submission on their Approvals screen.
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
        AppUser tl = resolveManagerFromSnapshot(entry);
        // "Awaiting review again after having been sent back" — so it requires BOTH a prior
        // rejection AND the entry being back in SUBMITTED. A prior-rejection check alone is true
        // for an entry that is merely sitting rejected, which would label it as resubmitted on
        // the Rejected tab. REQUEST_CHANGES is still honoured for entries sent back before V44.
        boolean isResubmission = entry.getStatus() == EodEntry.Status.SUBMITTED
                && actions.stream().anyMatch(a ->
                        a.getAction() == ApprovalAction.Action.REJECT
                     || a.getAction() == ApprovalAction.Action.REQUEST_CHANGES);

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

        ApprovalAction decision = latestDecision(actions);

        return new EodEntryEnrichment(
                escalated,
                tlInactivityHours,
                tl != null ? tl.getFullName() : null,
                tl != null ? tl.getId() : null,
                undertimeHours,
                isResubmission,
                decision != null ? decision.getActor().getFullName() : null,
                decision != null ? decision.getActor().getRole().name() : null,
                decision != null ? decision.getActedAt() : null
        );
    }

    /** Most recent APPROVE/REJECT action, or null if the entry is still undecided. */
    private ApprovalAction latestDecision(List<ApprovalAction> actions) {
        return actions.stream()
                .filter(a -> a.getAction() == ApprovalAction.Action.APPROVE || a.getAction() == ApprovalAction.Action.REJECT)
                .max(Comparator.comparing(ApprovalAction::getActedAt))
                .orElse(null);
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

    private EodEntryDto approveEntry(EodEntry entry, AppUser actor, String comment) {
        checkManagerAuthorization(actor, entry);
        requireStatus(entry, EodEntry.Status.SUBMITTED);

        OffsetDateTime now = OffsetDateTime.now();
        recordAction(entry, actor, ApprovalAction.Action.APPROVE, comment, now);

        entry.setStatus(EodEntry.Status.APPROVED);
        entry.setUpdatedAt(now);
        entryRepository.save(entry);

        writeAudit(entry, "EOD_APPROVED", actor, now);
        utilizationService.recomputeForEntry(entry.getId());
        notificationService.send(entry.getEmployee().getId(), "EOD_APPROVED",
                "EOD entry approved",
                "Your EOD entry for " + com.nforceone.sync.notification.NotificationDates.format(entry.getEntryDate()) + " has been approved.",
                "/eod/history");
        return EodEntryDto.from(entry);
    }

    private void checkManagerAuthorization(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;

        AppUser manager = resolveManagerFromSnapshot(entry);
        boolean isDirectManager = manager != null && manager.getId().equals(actor.getId());

        // Keys off projectManager, NOT pm — pm holds the project's Team Lead. Using pm here let a
        // PM load entries via findByProjectManagerIdAndStatus (which correctly keys off
        // projectManager) and then get 403 on approve/reject, since their id was being matched
        // against the Team Lead field instead.
        boolean isProjectManager = entry.getTasks().stream()
                .map(EodTask::getProject)
                .filter(Objects::nonNull)
                .map(Project::getProjectManager)
                .filter(Objects::nonNull)
                .anyMatch(pm -> pm.getId().equals(actor.getId()));

        if (!isDirectManager && !isProjectManager) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the employee's direct manager or a project manager on this entry can perform this action");
        }
    }

    // The manager who actually owns this entry's approval cycle — the manager_id snapshot
    // taken at submission time, NOT the employee's current/live manager. Falls back to the
    // employee's live manager for pre-snapshot entries (managerId == null, e.g. rows that
    // predate V57 and were never resubmitted since).
    private AppUser resolveManagerFromSnapshot(EodEntry entry) {
        if (entry.getManagerId() != null) {
            return userRepository.findById(entry.getManagerId()).orElse(null);
        }
        return entry.getEmployee().getManager();
    }

    private void requireStatus(EodEntry entry, EodEntry.Status required) {
        if (entry.getStatus() != required) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Entry must be in " + required + " status; current: " + entry.getStatus());
        }
    }

    private void recordAction(EodEntry entry, AppUser actor,
                               ApprovalAction.Action action, String comment,
                               OffsetDateTime now) {
        ApprovalAction aa = new ApprovalAction();
        aa.setEodEntry(entry);
        aa.setActor(actor);
        aa.setAction(action);
        aa.setComment(comment);
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
