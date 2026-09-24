package com.nforceone.sync.ai.repository;

import com.nforceone.sync.ai.entity.AiInteractionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AiInteractionLogRepository extends JpaRepository<AiInteractionLog, Long> {

    /**
     * The most recent turn in this conversation belonging to this user — feedback (M5) attaches
     * to this by default when no {@code messageId} is supplied. Owner-scoped by {@code userId} so
     * feedback on a foreign or stale conversation id silently matches nothing rather than leaking
     * whether that conversation exists.
     */
    Optional<AiInteractionLog> findFirstByConversationIdAndUserIdOrderByCreatedAtDesc(UUID conversationId, Long userId);

    /** The specific turn a message-scoped feedback call targets, still owner-scoped. */
    Optional<AiInteractionLog> findByAssistantMessageIdAndUserId(Long assistantMessageId, Long userId);

    // Usage/billing aggregation (M6/M8) uses a dedicated @Query with GROUP BY, deliberately not a
    // findByCreatedAtGreaterThanEqual-shaped method here — that would load every row in the
    // window into memory, the exact anti-pattern this module's plan calls out as a OneHR
    // weakness to fix, not repeat (see AiUsageStatsService once it exists).

    @Modifying
    @Query("delete from AiInteractionLog l where l.createdAt < :cutoff")
    int deleteByCreatedAtBefore(@Param("cutoff") OffsetDateTime cutoff);

    // ---- Usage/billing aggregation (M8) -----------------------------------------------------
    // All SQL GROUP BY, never a findByCreatedAtGreaterThanEqual-shaped method — I16 fix over
    // OneHR, which loaded every row in the window into memory to aggregate in Java.

    interface UsageTotalsProjection {
        Long getTotalAttempts();
        Long getTotalTurns();
        Long getSuccessCount();
        Long getErrorCount();
        Long getTotalPromptTokens();
        Long getTotalCompletionTokens();
        Long getTotalEmbeddingTokens();
        Double getAvgLatencyMs();
    }

    @Query(value = """
            SELECT
                COALESCE(SUM(api_call_attempts), 0) AS totalAttempts,
                COUNT(*) AS totalTurns,
                COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END), 0) AS successCount,
                COALESCE(SUM(CASE WHEN NOT success THEN 1 ELSE 0 END), 0) AS errorCount,
                COALESCE(SUM(prompt_tokens), 0) AS totalPromptTokens,
                COALESCE(SUM(completion_tokens), 0) AS totalCompletionTokens,
                COALESCE(SUM(embedding_prompt_tokens), 0) AS totalEmbeddingTokens,
                AVG(latency_ms) AS avgLatencyMs
            FROM ai_interaction_log WHERE created_at >= :since
            """, nativeQuery = true)
    UsageTotalsProjection aggregateTotals(@Param("since") OffsetDateTime since);

    interface DailyPointProjection {
        LocalDate getDay();
        Long getRequestCount();
        Long getSuccessCount();
        Long getErrorCount();
        Long getPromptTokens();
        Long getCompletionTokens();
        Long getEmbeddingTokens();
    }

    @Query(value = """
            SELECT
                (created_at AT TIME ZONE 'UTC')::date AS day,
                COALESCE(SUM(api_call_attempts), 0) AS requestCount,
                COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END), 0) AS successCount,
                COALESCE(SUM(CASE WHEN NOT success THEN 1 ELSE 0 END), 0) AS errorCount,
                COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
                COALESCE(SUM(completion_tokens), 0) AS completionTokens,
                COALESCE(SUM(embedding_prompt_tokens), 0) AS embeddingTokens
            FROM ai_interaction_log WHERE created_at >= :since
            GROUP BY 1 ORDER BY 1
            """, nativeQuery = true)
    List<DailyPointProjection> dailySeries(@Param("since") OffsetDateTime since);

    interface KeyCountProjection {
        String getKey();
        Long getCount();
    }

    @Query(value = "SELECT error_code AS key, COUNT(*) AS count FROM ai_interaction_log "
            + "WHERE created_at >= :since AND error_code IS NOT NULL GROUP BY error_code ORDER BY count DESC",
            nativeQuery = true)
    List<KeyCountProjection> errorCodeBreakdown(@Param("since") OffsetDateTime since);

    @Query(value = "SELECT response_type AS key, COUNT(*) AS count FROM ai_interaction_log "
            + "WHERE created_at >= :since AND response_type IS NOT NULL GROUP BY response_type ORDER BY count DESC",
            nativeQuery = true)
    List<KeyCountProjection> responseTypeBreakdown(@Param("since") OffsetDateTime since);

    /** Month-to-date (UTC) token sums, for the billing estimate — same GROUP-BY-not-load-rows discipline. */
    interface TokenTotalsProjection {
        Long getPromptTokens();
        Long getCompletionTokens();
        Long getEmbeddingTokens();
    }

    @Query(value = """
            SELECT
                COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
                COALESCE(SUM(completion_tokens), 0) AS completionTokens,
                COALESCE(SUM(embedding_prompt_tokens), 0) AS embeddingTokens
            FROM ai_interaction_log WHERE created_at >= :since
            """, nativeQuery = true)
    TokenTotalsProjection aggregateTokens(@Param("since") OffsetDateTime since);
}
