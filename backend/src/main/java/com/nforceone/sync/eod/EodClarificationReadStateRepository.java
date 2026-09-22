package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EodClarificationReadStateRepository extends JpaRepository<EodClarificationReadState, Long> {

    Optional<EodClarificationReadState> findByClarificationIdAndUserId(Long clarificationId, Long userId);

    // Batch lookup for the EOD Inbox list — one query per page load rather than one per row.
    List<EodClarificationReadState> findByClarificationIdInAndUserId(List<Long> clarificationIds, Long userId);
}
