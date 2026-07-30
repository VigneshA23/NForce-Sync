package com.nforceone.sync.admin;

import com.nforceone.sync.admin.dto.AuditLogDto;
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

@RestController
@RequestMapping("/api/audit")
@PreAuthorize("hasRole('SUPERADMIN')")
public class AuditLogController {

    private final AuditLogRepository auditLogRepository;

    public AuditLogController(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @GetMapping
    public Page<AuditLogDto> list(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) Long actorId,
            @RequestParam(required = false) String actorName,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "25") int size) {

        Specification<AuditLog> spec = Specification
                .where(AuditLogSpecs.entityTypeIs(entityType))
                .and(AuditLogSpecs.actionIs(action))
                .and(AuditLogSpecs.actorIdIs(actorId))
                .and(AuditLogSpecs.actorNameContains(actorName))
                .and(AuditLogSpecs.occurredAfter(from))
                .and(AuditLogSpecs.occurredBefore(to));

        Pageable pageable = PageRequest.of(page, size, Sort.by("occurredAt").descending());

        return auditLogRepository.findAll(spec, pageable).map(AuditLogDto::from);
    }

    @GetMapping("/{id}")
    public AuditLogDto getById(@PathVariable Long id) {
        return auditLogRepository.findById(id)
                .map(AuditLogDto::from)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Audit log entry not found"));
    }
}
