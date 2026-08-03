package com.nforceone.sync.approval;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ApprovalActionRepository extends JpaRepository<ApprovalAction, Long> {

    List<ApprovalAction> findByEodEntryIdOrderByActedAtDesc(Long eodEntryId);

    // One query for N entries instead of N queries — used by list endpoints
    @Query("""
        SELECT a FROM ApprovalAction a
        WHERE a.eodEntry.id IN :entryIds
          AND (a.action = com.nforceone.sync.approval.ApprovalAction.Action.REJECT
            OR a.action = com.nforceone.sync.approval.ApprovalAction.Action.REQUEST_CHANGES)
        ORDER BY a.eodEntry.id ASC, a.actedAt DESC
        """)
    List<ApprovalAction> findReviewerCommentsByEntryIds(@Param("entryIds") List<Long> entryIds);
}
