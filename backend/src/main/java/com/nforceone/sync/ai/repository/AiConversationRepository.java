package com.nforceone.sync.ai.repository;

import com.nforceone.sync.ai.entity.AiConversation;
import org.springframework.data.repository.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Extends the bare {@link Repository} marker, not {@code JpaRepository} / {@code CrudRepository},
 * so there is <b>no inherited unscoped {@code findById}</b> at all — this is a compile-time
 * guarantee, not just a convention. Every lookup declared here also constrains by
 * {@code userId}, so a foreign or invalid conversation id can only ever come back empty; it can
 * never expose another user's transcript.
 */
public interface AiConversationRepository extends Repository<AiConversation, UUID> {

    AiConversation save(AiConversation conversation);

    Optional<AiConversation> findByIdAndUserId(UUID id, Long userId);
}
