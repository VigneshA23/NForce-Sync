package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface EodClarificationRepository extends JpaRepository<EodClarification, Long> {

    // The current round, whatever its non-terminal status (NEEDS_RESPONSE or ACKNOWLEDGED) — the
    // partial unique index guarantees at most one such row per entry.
    Optional<EodClarification> findByEodEntryIdAndStatusNot(Long eodEntryId, EodClarification.Status status);

    boolean existsByEodEntryIdAndStatusNot(Long eodEntryId, EodClarification.Status status);

    // Most recent round overall (any status) — the thread endpoints show this one, per the
    // "only the latest round's thread is shown" simplification (older rounds stay in the DB for
    // audit/history but aren't surfaced in v1).
    Optional<EodClarification> findFirstByEodEntryIdOrderByOpenedAtDesc(Long eodEntryId);

    // Every round against this entry, latest and historical alike — used by markRead. The EOD
    // Inbox list surfaces each round as its own row (see EodInboxItemDto), but opening any of
    // those rows always shows the same latest-round thread (getThread, above), so "reading" one
    // row reads the whole entry's clarification history as far as the UI ever exposes it — a
    // historical round otherwise has no way to ever be marked read on its own.
    List<EodClarification> findByEodEntryId(Long eodEntryId);

    // Team Lead's EOD Inbox — Open / Resolved tabs, scoped by the entry's manager-snapshot, same
    // field ApprovalService/Blockers already key off. "Open" here means status <> RESOLVED
    // (covers both NEEDS_RESPONSE and ACKNOWLEDGED).
    // eodEntry/eodEntry.employee/openedBy/resolvedBy eagerly fetched — EodInboxItemDto.from reads
    // all four for every row; without this it was a lazy-load round trip per row per field (N+1)
    // against the remote Neon instance, on every EOD Inbox list query below.
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    List<EodClarification> findByEodEntry_ManagerIdAndStatusNotOrderByOpenedAtDesc(Long managerId, EodClarification.Status status);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    List<EodClarification> findByEodEntry_ManagerIdAndStatusOrderByResolvedAtDesc(Long managerId, EodClarification.Status status);

    // Employee's own EOD Inbox — Open / Resolved tabs, scoped to entries they submitted.
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    List<EodClarification> findByEodEntry_Employee_IdAndStatusNotOrderByOpenedAtDesc(Long employeeId, EodClarification.Status status);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    List<EodClarification> findByEodEntry_Employee_IdAndStatusOrderByResolvedAtDesc(Long employeeId, EodClarification.Status status);

    // PM's EOD Inbox — read-only, cross-team, scoped by project ownership (mirrors
    // PmBlockersService: EXISTS over eod_task.project.projectManager, not the entry's manager).
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status <> com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND EXISTS (SELECT 1 FROM EodTask t WHERE t.eodEntry = c.eodEntry AND t.project.projectManager.id = :pmId)
        ORDER BY c.openedAt DESC
        """)
    List<EodClarification> findOpenByProjectManagerId(@Param("pmId") Long pmId);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status = com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND EXISTS (SELECT 1 FROM EodTask t WHERE t.eodEntry = c.eodEntry AND t.project.projectManager.id = :pmId)
        ORDER BY c.resolvedAt DESC
        """)
    List<EodClarification> findResolvedByProjectManagerId(@Param("pmId") Long pmId);
}
