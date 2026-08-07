package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BlockerReplyRepository extends JpaRepository<BlockerReply, Long> {

    List<BlockerReply> findByTaskIdOrderByCreatedAtAsc(Long taskId);

    // Batch load for a whole blocker list (Team Lead's Blockers page) — avoids one query per
    // row for the Replies/Last Reply columns.
    List<BlockerReply> findByTaskIdInOrderByCreatedAtAsc(List<Long> taskIds);
}
