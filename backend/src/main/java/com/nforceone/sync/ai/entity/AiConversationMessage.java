package com.nforceone.sync.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

/** One turn's USER or ASSISTANT message. Ordered by {@code id} (BIGSERIAL), not just {@code created_at}, so two rows written in the same millisecond can never be mispaired. */
@Entity
@Table(name = "ai_conversation_message")
@Getter
@Setter
public class AiConversationMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    /** {@code USER} or {@code ASSISTANT} — see V93's CHECK constraint. */
    @Column(name = "sender", nullable = false, length = 16)
    private String sender;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    /** The AssistantResponseType name, set only on ASSISTANT rows. */
    @Column(name = "response_type", length = 20)
    private String responseType;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
