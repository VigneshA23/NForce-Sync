package com.nforceone.sync.approval2;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EodProjectApprovalActionRepository extends JpaRepository<EodProjectApprovalAction, Long> {

    List<EodProjectApprovalAction> findByPieceIdOrderByActedAtAsc(Long pieceId);

    Optional<EodProjectApprovalAction> findTopByPieceIdOrderByActedAtDesc(Long pieceId);

    /** Batch form of findTopByPieceIdOrderByActedAtDesc — ordered ascending so the caller can fold
     *  this into a Map<pieceId, action> and have the last write per piece be the latest action,
     *  without one query per piece. */
    List<EodProjectApprovalAction> findByPieceIdInOrderByActedAtAsc(List<Long> pieceIds);
}
