package com.nforceone.sync.approval;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ApprovalActionRepository extends JpaRepository<ApprovalAction, Long> {

    List<ApprovalAction> findByEodEntryIdOrderByActedAtDesc(Long eodEntryId);

    // Most recent approval for one employee, across all their EOD entries — powers "Last
    // Approved EOD" on the Team Utilization detail panel.
    java.util.Optional<ApprovalAction> findTopByEodEntryEmployeeIdAndActionOrderByActedAtDesc(
            Long employeeId, ApprovalAction.Action action);

    // One query for N entries instead of N queries — used by list endpoints
    @Query("""
        SELECT a FROM ApprovalAction a
        WHERE a.eodEntry.id IN :entryIds
          AND (a.action = com.nforceone.sync.approval.ApprovalAction.Action.REJECT
            OR a.action = com.nforceone.sync.approval.ApprovalAction.Action.REQUEST_CHANGES)
        ORDER BY a.eodEntry.id ASC, a.actedAt DESC
        """)
    List<ApprovalAction> findReviewerCommentsByEntryIds(@Param("entryIds") List<Long> entryIds);

    // Unfiltered — every action (approve/reject/request-changes) for a batch of entries, used
    // for escalation ("did the TL act at all?"), resubmission-flagging, and the per-entry
    // audit-trail endpoint. findReviewerCommentsByEntryIds above can't serve those since it
    // drops APPROVE actions.
    @Query("""
        SELECT a FROM ApprovalAction a
        WHERE a.eodEntry.id IN :entryIds
        ORDER BY a.eodEntry.id ASC, a.actedAt ASC
        """)
    List<ApprovalAction> findByEodEntryIdIn(@Param("entryIds") List<Long> entryIds);
}
