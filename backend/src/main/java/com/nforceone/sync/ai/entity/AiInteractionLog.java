package com.nforceone.sync.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row per assistant turn — what it was working from when it answered, never the question or
 * answer text itself (that lives only in {@link AiConversationMessage#getContent()}). See V94's
 * comment for the full rationale and the {@code error_code} vocabulary.
 */
@Entity
@Table(name = "ai_interaction_log")
@Getter
@Setter
public class AiInteractionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id")
    private UUID conversationId;

    @Column(name = "assistant_message_id")
    private Long assistantMessageId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** The AppUser.Role name at the time of this turn. */
    @Column(name = "role", nullable = false, length = 20)
    private String role;

    @Column(name = "current_page_id", length = 60)
    private String currentPageId;

    @Column(name = "response_type", length = 20)
    private String responseType;

    @Column(name = "confidence", length = 10)
    private String confidence;

    @Column(name = "navigation_page_id", length = 60)
    private String navigationPageId;

    /** JSON array of knowledgeIds actually retrieved for this turn. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "retrieved_knowledge_ids", columnDefinition = "jsonb")
    private String retrievedKnowledgeIds;

    @Column(name = "retrieved_count")
    private Integer retrievedCount;

    @Column(name = "top_score")
    private Double topScore;

    /** JSON array of live-data provider ids that ran — ids only, never the data they returned. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "live_data_providers", columnDefinition = "jsonb")
    private String liveDataProviders;

    @Column(name = "provider", length = 30)
    private String provider;

    @Column(name = "model", length = 60)
    private String model;

    @Column(name = "prompt_tokens")
    private Integer promptTokens;

    @Column(name = "completion_tokens")
    private Integer completionTokens;

    @Column(name = "embedding_prompt_tokens")
    private Integer embeddingPromptTokens;

    @Column(name = "api_call_attempts", nullable = false)
    private Integer apiCallAttempts = 1;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(name = "success", nullable = false)
    private boolean success;

    /**
     * DISABLED | EMPTY_MESSAGE | MESSAGE_TOO_LONG | RATE_LIMITED | INACTIVE_USER | NO_KNOWLEDGE |
     * RETRIEVAL_UNAVAILABLE | PROVIDER_UNAVAILABLE | MALFORMED_OUTPUT | UNKNOWN_ANSWER
     */
    @Column(name = "error_code", length = 40)
    private String errorCode;

    @Column(name = "question_chars", nullable = false)
    private Integer questionChars;

    /** {@code UP} or {@code DOWN}. */
    @Column(name = "feedback_rating", length = 4)
    private String feedbackRating;

    @Column(name = "feedback_comment", columnDefinition = "TEXT")
    private String feedbackComment;

    @Column(name = "feedback_at")
    private OffsetDateTime feedbackAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
