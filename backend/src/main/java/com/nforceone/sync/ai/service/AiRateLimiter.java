package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.exception.AiRateLimitExceededException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-user request budget, enforced before any retrieval, embedding, or LLM call. In-memory
 * sliding-window log, one {@link Deque} per user guarded by a per-user lock so concurrent
 * requests from the same person cannot exceed the budget.
 *
 * <p>Multi-instance note (unchanged from OneHR, and an accepted trade-off, not a bug): the
 * counting store is per-JVM memory, not shared — on N backend instances the effective ceiling is
 * the configured limit × N. Acceptable because this is a cost guard, not a security control.
 *
 * <p>I3 fix over OneHR: idle users' windows are periodically evicted (OneHR's {@code evictExpired()}
 * existed but was never actually called in production, so its map only grew).
 */
@Service
public class AiRateLimiter {

    private static final Duration IDLE_EVICTION_AGE = Duration.ofHours(2);

    private static final class UserWindow {
        final Deque<Instant> timestamps = new ArrayDeque<>();
        volatile Instant lastAccess = Instant.now();
    }

    private final AiRateLimitSettingsService settingsService;
    private final Map<Long, UserWindow> windows = new ConcurrentHashMap<>();

    public AiRateLimiter(AiRateLimitSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    /** @throws AiRateLimitExceededException if the caller is over budget. Otherwise records this call and returns. */
    public void checkAndRecord(Long userId) {
        AiRateLimitSettingsService.RateLimitConfig config = settingsService.currentForEnforcement();
        if (!config.enabled() || config.requestsPerWindow() <= 0) {
            return;
        }
        Duration window = Duration.ofMinutes(config.windowMinutes());
        UserWindow userWindow = windows.computeIfAbsent(userId, id -> new UserWindow());

        synchronized (userWindow) {
            userWindow.lastAccess = Instant.now();
            Instant now = userWindow.lastAccess;
            Instant cutoff = now.minus(window);
            while (!userWindow.timestamps.isEmpty() && userWindow.timestamps.peekFirst().isBefore(cutoff)) {
                userWindow.timestamps.pollFirst();
            }
            if (userWindow.timestamps.size() >= config.requestsPerWindow()) {
                Instant oldest = userWindow.timestamps.peekFirst();
                long retryAfterSeconds = Duration.between(now, oldest.plus(window)).getSeconds();
                throw new AiRateLimitExceededException(Math.max(1, retryAfterSeconds));
            }
            userWindow.timestamps.addLast(now);
        }
    }

    /** Every 10 minutes, drop any user's window untouched for 2+ hours — bounds the map's memory over a long-running instance. */
    @Scheduled(fixedRate = 600_000)
    void evictIdleUsers() {
        Instant cutoff = Instant.now().minus(IDLE_EVICTION_AGE);
        windows.entrySet().removeIf(entry -> entry.getValue().lastAccess.isBefore(cutoff));
    }
}
