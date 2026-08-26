package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BlockerReplyRepository extends JpaRepository<BlockerReply, Long> {

    List<BlockerReply> findByTaskIdOrderByCreatedAtAsc(Long taskId);

    // Batch load for a whole blocker list (Team Lead's Blockers page) — avoids one query per
    // row for the Replies/Last Reply columns. JOIN FETCHes sender since TeamBlockerDto.from
    // reads lastReply.getSender() for every task that has replies — without the fetch that's
    // an extra lazy-load per such task (only caller is TeamLeadService.getBlockers).
    @Query("SELECT DISTINCT r FROM BlockerReply r JOIN FETCH r.sender WHERE r.task.id IN :taskIds ORDER BY r.createdAt ASC")
    List<BlockerReply> findByTaskIdInOrderByCreatedAtAsc(@Param("taskIds") List<Long> taskIds);
}
