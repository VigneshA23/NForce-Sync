package com.nforceone.sync.approval2;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface EodProjectApprovalRepository extends JpaRepository<EodProjectApproval, Long> {

    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE p.approver.id = :approverId AND p.status = :status")
    List<EodProjectApproval> findByApproverIdAndStatus(@Param("approverId") Long approverId,
                                                        @Param("status") EodProjectApproval.Status status);

    @Query("SELECT p FROM EodProjectApproval p JOIN FETCH p.eodEntry e JOIN FETCH e.employee " +
           "LEFT JOIN FETCH p.project LEFT JOIN FETCH p.approver " +
           "WHERE p.status = :status")
    List<EodProjectApproval> findAllByStatus(@Param("status") EodProjectApproval.Status status);

    List<EodProjectApproval> findByEodEntryId(Long eodEntryId);

    List<EodProjectApproval> findByProjectIdAndStatus(Long projectId, EodProjectApproval.Status status);
}
