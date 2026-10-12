package com.nforceone.sync.approval;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.approval.dto.ApprovalActionDto;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.businessrules.BusinessRuleConfig;
import com.nforceone.sync.businessrules.BusinessRuleConfigRepository;
import com.nforceone.sync.eod.EodAttachmentService;
import com.nforceone.sync.eod.EodClarification;
import com.nforceone.sync.eod.EodClarificationRepository;
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
    private final EodAttachmentService    attachmentService;
    private final EodClarificationRepository clarificationRepository;
    private final com.nforceone.sync.approval2.ApprovalPieceService pieceService;
    private final com.nforceone.sync.approval2.EodProjectApprovalRepository pieceRepository;

    public ApprovalService(EodEntryRepository entryRepository,
                           AppUserRepository userRepository,
                           ApprovalActionRepository actionRepository,
                           AuditLogRepository auditLogRepository,
                           UtilizationService utilizationService,
                           ObjectMapper objectMapper,
                           NotificationService notificationService,
                           BusinessRuleConfigRepository configRepository,
                           EodAttachmentService attachmentService,
                           EodClarificationRepository clarificationRepository,
                           com.nforceone.sync.approval2.ApprovalPieceService pieceService,
                           com.nforceone.sync.approval2.EodProjectApprovalRepository pieceRepository) {
        this.entryRepository     = entryRepository;
        this.userRepository      = userRepository;
        this.actionRepository    = actionRepository;
        this.auditLogRepository  = auditLogRepository;
        this.utilizationService  = utilizationService;
        this.objectMapper        = objectMapper;
        this.notificationService = notificationService;
        this.configRepository    = configRepository;
        this.attachmentService   = attachmentService;
        this.clarificationRepository = clarificationRepository;
        this.pieceService = pieceService;
        this.pieceRepository = pieceRepository;
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
        return getPendingForActor(actorEmail, from, to, null, null);
    }

    /**
     * {@code pmId}/{@code managerId} let a Super Admin narrow read-only visibility to one
     * specific Project Manager's or Team Lead's pending backlog (Super Admin Reportee Views
     * enhancement) — honored ONLY when the actor is SUPERADMIN, so a PM/Team Lead cannot widen
     * their own scope by supplying someone else's id. Omitting both for a Super Admin falls back
     * to the full system-wide pending backlog across every PM/Team Lead.
     */
    @Transactional(readOnly = true)
    public List<EodEntryDto> getPendingForActor(String actorEmail, LocalDate from, LocalDate to, Long pmId, Long managerId) {
        AppUser actor = requireUserByEmail(actorEmail);

        if (actor.getRole() == AppUser.Role.SUPERADMIN) {
            if (pmId != null) {
                return enrichAll(entryRepository.findByPmIdAndStatus(pmId, EodEntry.Status.SUBMITTED));
            }
            if (managerId != null) {
                List<EodEntry> entries = (from != null && to != null)
                        ? entryRepository.findPendingByManagerIdAndEntryDateBetween(managerId, EodEntry.Status.SUBMITTED, from, to)
                        : entryRepository.findPendingByManagerId(managerId, EodEntry.Status.SUBMITTED);
                return enrichAll(entries);
            }
            return enrichAll(entryRepository.findAllByStatus(EodEntry.Status.SUBMITTED));
        }

        if (actor.getRole() == AppUser.Role.PM) {
            // A PM decides only what was ESCALATED to him — not every submitted entry on his projects.
            return enrichAll(escalatedEntries(actor, com.nforceone.sync.approval2.EodProjectApproval.Status.PENDING));
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
        return getDecidedForActor(actorEmail, status, null, null);
    }

    /** See {@link #getPendingForActor(String, LocalDate, LocalDate, Long, Long)} — same
     *  SUPERADMIN-only pmId/managerId narrowing, applied to the Approved/Rejected tabs. */
    @Transactional(readOnly = true)
    public List<EodEntryDto> getDecidedForActor(String actorEmail, EodEntry.Status status, Long pmId, Long managerId) {
        AppUser actor = requireUserByEmail(actorEmail);

        if (actor.getRole() == AppUser.Role.SUPERADMIN) {
            if (pmId != null) {
                return enrichAll(entryRepository.findByPmIdAndStatus(pmId, status));
            }
            if (managerId != null) {
                return enrichAll(entryRepository.findDecidedByManagerId(managerId, status));
            }
            return enrichAll(entryRepository.findAllByStatus(status));
        }

        if (actor.getRole() == AppUser.Role.PM) {
            // Only entries with a piece escalated to this PM (what he decides), in the requested state.
            com.nforceone.sync.approval2.EodProjectApproval.Status pieceStatus = switch (status) {
                case APPROVED -> com.nforceone.sync.approval2.EodProjectApproval.Status.APPROVED;
                case REJECTED -> com.nforceone.sync.approval2.EodProjectApproval.Status.REJECTED;
                default -> null;
            };
            return pieceStatus == null ? List.of() : enrichAll(escalatedEntries(actor, pieceStatus));
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

    // The legacy entry-level endpoints are kept for the Team Lead detail modal, but they no longer carry
    // their own decision logic: each one delegates to the piece path (ApprovalPieceService), the single rule
    // for who may decide what. So a project manager can decide only what was escalated to him, a
    // self-approval is rejected, the clarification gate applies, and the entry status is always derived from
    // its pieces — no path here sets an entry APPROVED without touching them.
    public EodEntryDto approve(Long entryId, String actorEmail, String comment) {
        return pieceService.decideEntryPieces(entryId, actorEmail, true, comment);
    }

    public EodEntryDto reject(Long entryId, String actorEmail, String comment) {
        return pieceService.decideEntryPieces(entryId, actorEmail, false, comment);
    }

    // requestChanges() removed in V44 — reject() covers it. A rejected entry is editable and
    // resubmittable, which is all "changes requested" ever did.

    // Entries with nothing left to decide (already decided elsewhere) are silently skipped rather than
    // aborting the whole batch — a TL clicking "Approve all" expects the ready ones to go through.
    // decideEntryPieces still throws hard for an entry the caller may not decide.
    public List<EodEntryDto> batchApprove(List<Long> entryIds, String actorEmail) {
        return entryIds.stream()
                .map(this::requireEntryById)
                .filter(entry -> entry.getStatus() == EodEntry.Status.SUBMITTED
                        || entry.getStatus() == EodEntry.Status.PARTIALLY_APPROVED)
                .map(entry -> pieceService.decideEntryPieces(entry.getId(), actorEmail, true, null))
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
        EodAttachmentService.AttachmentsByScope attachments = attachmentService.loadForEntries(entryIds);
        return entries.stream()
                .map(e -> EodEntryDto.from(e, latestReviewerComment(actionsByEntry.get(e.getId())),
                        enrich(e, actionsByEntry.getOrDefault(e.getId(), List.of()), slaHours, standardHours, now),
                        attachments.entryLevelByEntryId().getOrDefault(e.getId(), List.of()),
                        attachments.byTaskId()))
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
        if (entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG) {
            // Plain-log entries (PM/Admin daily logs) are never routed through the team-lead
            // chain, so the "no TL → escalate immediately" branch must not fire for them.
            escalated = false;
        } else if (tl == null) {
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


    private void checkManagerAuthorization(AppUser actor, EodEntry entry) {
        if (actor.getRole() == AppUser.Role.SUPERADMIN) return;

        AppUser manager = resolveManagerFromSnapshot(entry);
        boolean isDirectManager = manager != null && manager.getId().equals(actor.getId());

        // READ access to an entry's audit trail only (approve/reject no longer pass through here — they
        // delegate to ApprovalPieceService). A PM qualifies when the entry touches a project he is PM of.
        boolean isProjectManager = com.nforceone.sync.project.PmScopeService.entryTouchesManagedProject(actor, entry);

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



    /** Distinct entries having a current-cycle piece escalated to {@code pm} in the given piece state. */
    private List<EodEntry> escalatedEntries(AppUser pm, com.nforceone.sync.approval2.EodProjectApproval.Status status) {
        return pieceRepository.findByEscalatedToIdAndStatus(pm.getId(), status).stream()
                .map(com.nforceone.sync.approval2.EodProjectApproval::getEodEntry)
                .collect(Collectors.toMap(EodEntry::getId, e -> e, (a, b) -> a, java.util.LinkedHashMap::new))
                .values().stream().toList();
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
