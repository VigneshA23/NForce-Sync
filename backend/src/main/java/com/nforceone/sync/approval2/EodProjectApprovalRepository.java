package com.nforceone.sync.approval2;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface EodProjectApprovalRepository extends JpaRepository<EodProjectApproval, Long> {

    // ── Pending-queue queries — current cycle only (superseded_at IS NULL) ──────

    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE p.approver.id = :approverId AND p.status = :status AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByApproverIdAndStatus(@Param("approverId") Long approverId,
                                                        @Param("status") EodProjectApproval.Status status);

    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE p.status = :status AND p.supersededAt IS NULL")
    List<EodProjectApproval> findAllByStatus(@Param("status") EodProjectApproval.Status status);

    // ── Entry-scoped queries ─────────────────────────────────────────────────────

    /**
     * Current-cycle pieces for an entry (superseded_at IS NULL). Used by updateEntryStatus
     * (must reflect only the active approval cycle) and by EodService.submit() to find pieces
     * that need to be superseded on resubmission.
     */
    @Query("SELECT p FROM EodProjectApproval p WHERE p.eodEntry.id = :eodEntryId AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByEodEntryId(@Param("eodEntryId") Long eodEntryId);

    /**
     * All pieces for an entry across every submission cycle, including superseded ones.
     * Use this for full audit history — shows who approved/rejected each cycle and when.
     */
    @Query("SELECT p FROM EodProjectApproval p WHERE p.eodEntry.id = :eodEntryId ORDER BY p.id")
    List<EodProjectApproval> findAllPiecesByEodEntryId(@Param("eodEntryId") Long eodEntryId);

    /**
     * Current-cycle pieces with all associations eagerly fetched — for the employee's
     * status-chip view and the approver's detail view. Only the active cycle is returned;
     * superseded pieces from prior submission cycles are excluded.
     */
    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE e.id = :entryId AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByEodEntryIdWithDetails(@Param("entryId") Long entryId);

    /**
     * Current-cycle pieces by project and status. Superseded pieces are excluded so that
     * resubmitted entries do not resurface approved/rejected history from prior cycles.
     */
    @Query("SELECT p FROM EodProjectApproval p WHERE p.project.id = :projectId " +
           "AND p.status = :status AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByProjectIdAndStatus(@Param("projectId") Long projectId,
                                                       @Param("status") EodProjectApproval.Status status);

    @Query("SELECT COUNT(p) FROM EodProjectApproval p WHERE p.project.id = :projectId " +
           "AND p.status = 'PENDING' AND p.supersededAt IS NULL")
    long countPendingByProjectId(@Param("projectId") Long projectId);

    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE p.approver.id = :approverId AND p.approverType = :approverType " +
           "AND p.status = :status AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByApproverIdAndApproverTypeAndStatus(
            @Param("approverId") Long approverId,
            @Param("approverType") EodProjectApproval.ApproverType approverType,
            @Param("status") EodProjectApproval.Status status);

    /** ADMIN_GROUP pieces — no specific approver assigned; any Admin can act on these. */
    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE p.approverType = :approverType AND p.status = :status AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByApproverTypeAndStatus(
            @Param("approverType") EodProjectApproval.ApproverType approverType,
            @Param("status") EodProjectApproval.Status status);

    /** Stale LEAD pieces eligible for escalation: PENDING, not superseded, not yet escalated, frozen before cutoff. */
    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project proj LEFT JOIN FETCH proj.pm LEFT JOIN FETCH proj.lead " +
           "LEFT JOIN FETCH p.approver " +
           "WHERE p.approverType = com.nforceone.sync.approval2.EodProjectApproval.ApproverType.LEAD " +
           "AND p.status = com.nforceone.sync.approval2.EodProjectApproval.Status.PENDING " +
           "AND p.supersededAt IS NULL AND p.escalatedAt IS NULL " +
           "AND p.frozenAt < :cutoff")
    List<EodProjectApproval> findStaleLeadPiecesForEscalation(@Param("cutoff") OffsetDateTime cutoff);

    /** Escalated pieces where the given user is the designated fallback approver. */
    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver LEFT JOIN FETCH p.escalatedTo " +
           "WHERE p.escalatedTo.id = :escalatedToId AND p.status = :status AND p.supersededAt IS NULL")
    List<EodProjectApproval> findByEscalatedToIdAndStatus(
            @Param("escalatedToId") Long escalatedToId,
            @Param("status") EodProjectApproval.Status status);
}
