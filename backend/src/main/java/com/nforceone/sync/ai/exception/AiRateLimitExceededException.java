package com.nforceone.sync.ai.exception;

import java.time.Instant;

/**
 * Thrown when the caller is over their configured AI request budget. The only AI-assistant
 * decline that is not a controlled HTTP 200 — matches Sync's existing 423 account-lockout
 * pattern (a real status plus a retry hint), never Sync's plain 401 (see {@code AiExceptionHandler}
 * javadoc for why a bare 401/403 here would be dangerous).
 */
public class AiRateLimitExceededException extends RuntimeException {

    public static final String CODE = "AI_ASSISTANT_RATE_LIMIT_EXCEEDED";

    private final long retryAfterSeconds;
    private final Instant retryAt;

    public AiRateLimitExceededException(long retryAfterSeconds) {
        super("AI assistant rate limit exceeded");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
        this.retryAt = Instant.now().plusSeconds(this.retryAfterSeconds);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public Instant getRetryAt() {
        return retryAt;
    }
}
