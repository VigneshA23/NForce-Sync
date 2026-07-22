package com.nforceone.sync.auth;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long>, JpaSpecificationExecutor<AuditLog> {

    @EntityGraph(attributePaths = {"actor"})
    Page<AuditLog> findAll(Specification<AuditLog> spec, Pageable pageable);

    @EntityGraph(attributePaths = {"actor"})
    Optional<AuditLog> findById(Long id);

    @EntityGraph(attributePaths = {"actor"})
    List<AuditLog> findTop5ByOrderByOccurredAtDesc();

    long countByOccurredAtAfter(OffsetDateTime since);
}
