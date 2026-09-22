package com.nforceone.sync.eod;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EodClarificationReplyRepository extends JpaRepository<EodClarificationReply, Long> {

    // sender is eagerly fetched — EodClarificationReplyDto.from() reads r.getSender().getFullName()
    // for every reply; without this, each not-yet-loaded sender costs its own lazy-load round trip
    // (an N+1 that was the real bottleneck behind "View EOD" / the conversation panel feeling slow
    // to open, profiled at 600ms-1.5s for a handful of replies against the remote Neon instance).
    @EntityGraph(attributePaths = {"sender"})
    List<EodClarificationReply> findByClarificationIdOrderByCreatedAtAsc(Long clarificationId);

    // Batch lookup backing the EOD Inbox list's message preview / last-activity sort — one query
    // for every row's clarification instead of N. Ascending order lets the service fold this into
    // a Map<clarificationId, reply> by simply letting later entries overwrite earlier ones.
    // sender eagerly fetched for the same N+1 reason (lastMessageSenderName in EodInboxItemDto).
    @EntityGraph(attributePaths = {"sender"})
    List<EodClarificationReply> findByClarificationIdInOrderByCreatedAtAsc(List<Long> clarificationIds);
}
