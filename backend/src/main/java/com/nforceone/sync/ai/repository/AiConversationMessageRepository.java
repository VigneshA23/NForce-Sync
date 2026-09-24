package com.nforceone.sync.ai.repository;

import com.nforceone.sync.ai.entity.AiConversationMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Ordinary {@code JpaRepository} — unlike {@link AiConversationRepository}, message lookups are
 * always reached only after the caller's ownership of the parent conversation has already been
 * verified (see {@code ConversationService}), so no extra scoping guarantee is needed here.
 */
public interface AiConversationMessageRepository extends JpaRepository<AiConversationMessage, Long> {

    /** Most recent first — callers reverse for chronological display, or bound-and-pair for history. */
    List<AiConversationMessage> findByConversationIdOrderByIdDesc(UUID conversationId, Pageable pageable);

    long deleteByConversationId(UUID conversationId);
}
