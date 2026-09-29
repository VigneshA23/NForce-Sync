package com.nforceone.sync.approval2;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EodProjectApprovalActionRepository extends JpaRepository<EodProjectApprovalAction, Long> {

    List<EodProjectApprovalAction> findByPieceIdOrderByActedAtAsc(Long pieceId);
}
