package com.nforceone.sync.approval2;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EodProjectApprovalActionRepository extends JpaRepository<EodProjectApprovalAction, Long> {

    List<EodProjectApprovalAction> findByPieceIdOrderByActedAtAsc(Long pieceId);

    Optional<EodProjectApprovalAction> findTopByPieceIdOrderByActedAtDesc(Long pieceId);
}
