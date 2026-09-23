package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.AuditLogDto;
import com.nforceone.sync.admin.dto.AuditSummaryDto;
import com.nforceone.sync.auth.AuditLog;
import com.nforceone.sync.auth.AuditLogRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;

// Audit trail of account-administration actions (user CRUD, status/role/password changes) —
// owned by Admin, the role now responsible for those actions.
@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasRole('ADMIN')")
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    public AuditLogController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    public Page<AuditLogDto> list(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String action,
            // Distinguishes STATUS_CHANGE's Activate/Deactivate direction — see
            // AuditLogSpecs.afterStatusIs. Only meaningful alongside action=STATUS_CHANGE.
            @RequestParam(required = false) String afterStatus,
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String actorName,
            @RequestParam(required = false) String entityNames,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "25") int size,
            // Toggled by the Timestamp column header — newest-first ("desc") by default (AC2).
            @RequestParam(defaultValue = "desc") String sort) {

        Specification<AuditLog> spec = buildSpec(entityType, action, afterStatus, actorId, actorName, entityNames, from, to);

        Sort.Direction direction = "asc".equalsIgnoreCase(sort) ? Sort.Direction.ASC : Sort.Direction.DESC;
        Pageable pageable = PageRequest.of(page, size, Sort.by(direction, "occurredAt"));

        return auditLogRepository.findAll(spec, pageable).map(AuditLogDto::from);
    }

    @GetMapping("/{id}")
    public AuditLogDto getById(@PathVariable Long id) {
        return auditLogRepository.findById(id)
                .map(AuditLogDto::from)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Audit log entry not found"));
    }

    /** Backs the KPI strip — counts scoped to the same filters as {@link #list}, not the global
     *  total (per the Audit Log spec). {@code action}/{@code afterStatus} are accepted here too:
     *  if the caller already has an Action filter applied, the bucket counts reflect that
     *  narrowed set exactly like the table does, rather than ignoring it. */
    @GetMapping("/summary")
    public AuditSummaryDto summary(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String afterStatus,
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String actorName,
            @RequestParam(required = false) String entityNames,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {

        Specification<AuditLog> base = buildSpec(entityType, action, afterStatus, actorId, actorName, entityNames, from, to);

        long total      = auditLogRepository.count(base);
        long create     = auditLogRepository.count(base.and(AuditLogSpecs.actionIs("CREATE")));
        long update     = auditLogRepository.count(base.and(AuditLogSpecs.actionIs("UPDATE")));
        long delete     = auditLogRepository.count(base.and(AuditLogSpecs.actionIs("SOFT_DELETE")));
        long activate   = auditLogRepository.count(base.and(AuditLogSpecs.actionIs("STATUS_CHANGE")).and(AuditLogSpecs.afterStatusIs("ACTIVE")));
        long deactivate = auditLogRepository.count(base.and(AuditLogSpecs.actionIs("STATUS_CHANGE")).and(AuditLogSpecs.afterStatusIs("INACTIVE")));
        long other      = total - create - update - delete - activate - deactivate;

        return new AuditSummaryDto(total, create, update, delete, activate, deactivate, other);
    }

    private Specification<AuditLog> buildSpec(String entityType, String action, String afterStatus,
                                               Long actorId, String actorName, String entityNames,
                                               OffsetDateTime from, OffsetDateTime to) {
        List<String> entityNameList = entityNames == null || entityNames.isBlank()
                ? null
                : Arrays.asList(entityNames.split(","));

        return Specification
                .where(AuditLogSpecs.entityTypeIs(entityType))
                .and(AuditLogSpecs.actionIs(action))
                .and(AuditLogSpecs.afterStatusIs(afterStatus))
                .and(AuditLogSpecs.actorIdIs(actorId))
                .and(AuditLogSpecs.actorNameContains(actorName))
                .and(AuditLogSpecs.entityNameIn(entityNameList))
                .and(AuditLogSpecs.occurredAfter(from))
                .and(AuditLogSpecs.occurredBefore(to));
    }
}
