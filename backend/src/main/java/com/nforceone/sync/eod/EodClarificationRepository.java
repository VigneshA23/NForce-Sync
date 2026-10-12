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

    // Reviewer EOD Inbox — Open / Resolved tabs. Rounds on entries where the viewer is a
    // current-cycle piece approver or the escalated-to PM (they can act), OR the entry's frozen
    // reporting manager (read-only: they see the thread, but EodClarificationAccessPolicy denies
    // open/reply unless they are also an approver). "Open" means status <> RESOLVED (covers both
    // NEEDS_RESPONSE and ACKNOWLEDGED).
    // eodEntry/eodEntry.employee/openedBy/resolvedBy eagerly fetched — EodInboxItemDto.from reads
    // all four for every row; without this it was a lazy-load round trip per row per field (N+1)
    // against the remote Neon instance, on every EOD Inbox list query below.
    // TEAM INBOX (Team Lead section): rounds on entries where the viewer holds a LEAD-type piece — a
    // project he leads — or is the escalated-to approver. Being only the entry's frozen reporting manager
    // is NOT enough: those rounds belong to the My Reporting Team inbox (findOpenForReportingManager) and
    // must not leak into this section. A multi-project entry therefore appears for every lead who holds a
    // piece on it, as one shared thread.
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status <> com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND c.eodEntry.employee.id <> :userId
          AND EXISTS (SELECT 1 FROM EodProjectApproval p
                      WHERE p.eodEntry = c.eodEntry AND p.supersededAt IS NULL
                        AND ((p.approverType = com.nforceone.sync.approval2.EodProjectApproval.ApproverType.LEAD
                              AND p.approver.id = :userId)
                             OR p.escalatedTo.id = :userId))
        ORDER BY c.openedAt DESC
        """)
    List<EodClarification> findOpenForReviewer(@Param("userId") Long userId);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status = com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND c.eodEntry.employee.id <> :userId
          AND EXISTS (SELECT 1 FROM EodProjectApproval p
                      WHERE p.eodEntry = c.eodEntry AND p.supersededAt IS NULL
                        AND ((p.approverType = com.nforceone.sync.approval2.EodProjectApproval.ApproverType.LEAD
                              AND p.approver.id = :userId)
                             OR p.escalatedTo.id = :userId))
        ORDER BY c.resolvedAt DESC
        """)
    List<EodClarification> findResolvedForReviewer(@Param("userId") Long userId);

    // REPORTING MANAGER inbox (My Reporting Team section): rounds on entries whose FROZEN manager is the
    // viewer, minus the ones already in his Team Inbox (a user who is both a lead and the RM of the same
    // entry sees it once, in the Team Inbox). Never the viewer's own entry.
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status <> com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND c.eodEntry.employee.id <> :userId
          AND c.eodEntry.managerId = :userId
          AND NOT EXISTS (SELECT 1 FROM EodProjectApproval p
                          WHERE p.eodEntry = c.eodEntry AND p.supersededAt IS NULL
                            AND ((p.approverType = com.nforceone.sync.approval2.EodProjectApproval.ApproverType.LEAD
                                  AND p.approver.id = :userId)
                                 OR p.escalatedTo.id = :userId))
        ORDER BY c.openedAt DESC
        """)
    List<EodClarification> findOpenForReportingManager(@Param("userId") Long userId);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status = com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND c.eodEntry.employee.id <> :userId
          AND c.eodEntry.managerId = :userId
          AND NOT EXISTS (SELECT 1 FROM EodProjectApproval p
                          WHERE p.eodEntry = c.eodEntry AND p.supersededAt IS NULL
                            AND ((p.approverType = com.nforceone.sync.approval2.EodProjectApproval.ApproverType.LEAD
                                  AND p.approver.id = :userId)
                                 OR p.escalatedTo.id = :userId))
        ORDER BY c.resolvedAt DESC
        """)
    List<EodClarification> findResolvedForReportingManager(@Param("userId") Long userId);

    // Employee's own EOD Inbox — Open / Resolved tabs, scoped to entries they submitted.
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    List<EodClarification> findByEodEntry_Employee_IdAndStatusNotOrderByOpenedAtDesc(Long employeeId, EodClarification.Status status);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    List<EodClarification> findByEodEntry_Employee_IdAndStatusOrderByResolvedAtDesc(Long employeeId, EodClarification.Status status);

    // PM's EOD Inbox — read-only, cross-team, scoped by project ownership (mirrors
    // PmBlockersService: EXISTS over eod_task.project.pm, not the entry's manager).
    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status <> com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND c.eodEntry.employee.id <> :pmId
          AND EXISTS (SELECT 1 FROM EodTask t WHERE t.eodEntry = c.eodEntry AND t.project.pm.id = :pmId)
        ORDER BY c.openedAt DESC
        """)
    List<EodClarification> findOpenByPmId(@Param("pmId") Long pmId);

    @EntityGraph(attributePaths = {"eodEntry", "eodEntry.employee", "openedBy", "resolvedBy"})
    @Query("""
        SELECT c FROM EodClarification c
        WHERE c.status = com.nforceone.sync.eod.EodClarification.Status.RESOLVED
          AND c.eodEntry.employee.id <> :pmId
          AND EXISTS (SELECT 1 FROM EodTask t WHERE t.eodEntry = c.eodEntry AND t.project.pm.id = :pmId)
        ORDER BY c.resolvedAt DESC
        """)
    List<EodClarification> findResolvedByPmId(@Param("pmId") Long pmId);
}
