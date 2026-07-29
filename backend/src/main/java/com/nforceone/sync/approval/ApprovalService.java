package com.nforceone.sync.approval;

import tools.jackson.databind.ObjectMapper;
import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.auth.AppUserRepository;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodEntryRepository;
import com.nforceone.sync.eod.dto.EodEntryDto;
import com.nforceone.sync.utilization.UtilizationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class ApprovalService {

    private final EodEntryRepository     entryRepository;
    private final AppUserRepository      userRepository;
    private final ApprovalActionRepository actionRepository;
    private final AuditLogRepository     auditLogRepository;
    private final UtilizationService     utilizationService;
    private final ObjectMapper           objectMapper;

    public ApprovalService(EodEntryRepository entryRepository,
                           AppUserRepository userRepository,
                           ApprovalActionRepository actionRepository,
                           AuditLogRepository auditLogRepository,
                           UtilizationService utilizationService,
                           ObjectMapper objectMapper) {
        this.entryRepository    = entryRepository;
        this.userRepository     = userRepository;
        this.actionRepository   = actionRepository;
        this.auditLogRepository = auditLogRepository;
        this.utilizationService = utilizationService;
        this.objectMapper       = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<EodEntryDto> getPendingForManager(String actorEmail) {
        AppUser manager = requireUserByEmail(actorEmail);
        return entryRepository
                .findPendingByManagerId(manager.getId(), EodEntry.Status.SUBMITTED)
                .stream()
                .map(EodEntryDto::from)
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
        return EodEntryDto.from(entry);
    }

    public List<EodEntryDto> batchApprove(List<Long> entryIds, String actorEmail) {
        AppUser actor = requireUserByEmail(actorEmail);
        return entryIds.stream()
                .map(id -> approveEntry(requireEntryById(id), actor, null, null))
                .toList();
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
        return EodEntryDto.from(entry);
    }

    private void checkManagerAuthorization(AppUser actor, EodEntry entry) {
        AppUser manager = entry.getEmployee().getManager();
        if (manager == null) {
            // No manager assigned — only SUPERADMIN can act
            if (actor.getRole() != AppUser.Role.SUPERADMIN) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Employee has no assigned manager; only Super Admin can approve");
            }
            return;
        }
        boolean isDirectManager = manager.getId().equals(actor.getId());
        boolean isSuperAdmin    = actor.getRole() == AppUser.Role.SUPERADMIN;
        if (!isDirectManager && !isSuperAdmin) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the employee's direct manager can perform this action");
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
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Authenticated user record missing"));
    }

    private EodEntry requireEntryById(Long id) {
        return entryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "EOD entry not found"));
    }
}
