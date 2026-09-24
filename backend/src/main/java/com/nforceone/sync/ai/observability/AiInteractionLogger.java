package com.nforceone.sync.ai.observability;

import com.nforceone.sync.ai.entity.AiInteractionLog;
import com.nforceone.sync.ai.repository.AiInteractionLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Records what the assistant was working from on each turn — never the question or answer text
 * itself (that lives only in {@code ai_conversation_message}; see {@code AiInteractionLog}'s
 * javadoc). Every write is wrapped and swallowed: the user came here for help with Sync, not to
 * have their turn fail because a metrics row couldn't be written.
 *
 * <p>Never logs API keys, JWTs, passwords, password hashes, or any raw model/tool payload —
 * only the structured fields on {@link Turn}.
 */
@Component
public class AiInteractionLogger {

    private static final Logger logger = LoggerFactory.getLogger(AiInteractionLogger.class);

    private final AiInteractionLogRepository repository;
    private final ObjectMapper objectMapper;

    public AiInteractionLogger(AiInteractionLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public record Turn(
            UUID conversationId,
            Long assistantMessageId,
            Long userId,
            String role,
            String currentPageId,
            String responseType,
            String confidence,
            String navigationPageId,
            List<String> retrievedKnowledgeIds,
            int retrievedCount,
            Double topScore,
            List<String> liveDataProviders,
            String provider,
            String model,
            Integer promptTokens,
            Integer completionTokens,
            Integer embeddingPromptTokens,
            int apiCallAttempts,
            Long latencyMs,
            boolean success,
            String errorCode,
            int questionChars
    ) {
    }

    public void record(Turn turn) {
        try {
            AiInteractionLog entry = new AiInteractionLog();
            entry.setConversationId(turn.conversationId());
            entry.setAssistantMessageId(turn.assistantMessageId());
            entry.setUserId(turn.userId());
            entry.setRole(turn.role());
            entry.setCurrentPageId(turn.currentPageId());
            entry.setResponseType(turn.responseType());
            entry.setConfidence(turn.confidence());
            entry.setNavigationPageId(turn.navigationPageId());
            entry.setRetrievedKnowledgeIds(toJsonArray(turn.retrievedKnowledgeIds()));
            entry.setRetrievedCount(turn.retrievedCount());
            entry.setTopScore(turn.topScore());
            entry.setLiveDataProviders(toJsonArray(turn.liveDataProviders()));
            entry.setProvider(turn.provider());
            entry.setModel(turn.model());
            entry.setPromptTokens(turn.promptTokens());
            entry.setCompletionTokens(turn.completionTokens());
            entry.setEmbeddingPromptTokens(turn.embeddingPromptTokens());
            entry.setApiCallAttempts(turn.apiCallAttempts());
            entry.setLatencyMs(turn.latencyMs() == null ? null : turn.latencyMs().intValue());
            entry.setSuccess(turn.success());
            entry.setErrorCode(turn.errorCode());
            entry.setQuestionChars(turn.questionChars());
            entry.setCreatedAt(OffsetDateTime.now());
            repository.save(entry);
        } catch (RuntimeException e) {
            logger.warn("Failed to record AI interaction log entry (turn itself was not affected)", e);
        }
    }

    /**
     * Attaches a rating to a specific turn, or the caller's most recent turn in the conversation
     * if no specific message is targeted. Always completes without throwing — a stale, foreign,
     * or unmatched target must never reveal whether a conversation exists (mirrors
     * {@code ConversationService}'s owner-scoping posture).
     */
    public void recordFeedback(UUID conversationId, Long assistantMessageId, Long userId, String rating, String comment) {
        try {
            String normalizedRating = rating == null ? null : rating.trim().toUpperCase(Locale.ROOT);
            if (!"UP".equals(normalizedRating) && !"DOWN".equals(normalizedRating)) {
                return;
            }
            var target = assistantMessageId != null
                    ? repository.findByAssistantMessageIdAndUserId(assistantMessageId, userId)
                    : repository.findFirstByConversationIdAndUserIdOrderByCreatedAtDesc(conversationId, userId);
            if (target.isEmpty()) {
                return;
            }
            AiInteractionLog entry = target.get();
            entry.setFeedbackRating(normalizedRating);
            entry.setFeedbackComment(comment == null || comment.isBlank() ? null : comment.trim());
            entry.setFeedbackAt(OffsetDateTime.now());
            repository.save(entry);
        } catch (RuntimeException e) {
            logger.warn("Failed to record AI assistant feedback", e);
        }
    }

    private String toJsonArray(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (RuntimeException e) {
            return "[]";
        }
    }
}
