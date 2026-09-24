package com.nforceone.sync.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One conversation thread, owned by exactly one {@code app_user}. Deliberately flat — no
 * {@code @OneToMany} to messages, so clearing or fetching messages goes through
 * {@code AiConversationMessageRepository} queries rather than entity-graph navigation, keeping
 * this module's Hibernate footprint minimal and independent of {@code open-in-view: false}
 * lazy-loading pitfalls elsewhere in the app.
 */
@Entity
@Table(name = "ai_conversation")
@Getter
@Setter
public class AiConversation {

    /**
     * No {@code @GeneratedValue}: the DB column defaults to {@code gen_random_uuid()} (see V93),
     * but callers set a fresh {@code UUID.randomUUID()} here explicitly before the first save,
     * so a new conversation's id is known immediately without a round-trip to read it back.
     */
    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "last_message_at", nullable = false)
    private OffsetDateTime lastMessageAt;
}
