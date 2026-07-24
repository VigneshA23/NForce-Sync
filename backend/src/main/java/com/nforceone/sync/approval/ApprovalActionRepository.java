package com.nforceone.sync.approval;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ApprovalActionRepository extends JpaRepository<ApprovalAction, Long> {
    List<ApprovalAction> findByEodEntryIdOrderByActedAtDesc(Long eodEntryId);
}
