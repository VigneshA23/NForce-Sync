package com.nforceone.sync.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window limit on password-reset requests per email address (default 3 per 15 minutes).
 *
 * <p>Keyed on the normalised address whether or not an account exists, so being throttled reveals
 * nothing about registration. State is in memory: it is per application instance and resets on
 * restart, which is enough to stop mail-bombing a mailbox, not a substitute for an edge/IP limit.
 *
 * <p>Env: {@code PASSWORD_RESET_RATE_LIMIT_MAX} / {@code PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES}.
 */
@Component
public class ResetRequestRateLimiter {

    private static final int PRUNE_THRESHOLD = 5_000;

    private final int maxRequests;
    private final Duration window;
    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    @Autowired
    public ResetRequestRateLimiter(
            @Value("${app.password-reset.rate-limit.max-requests:3}") int maxRequests,
            @Value("${app.password-reset.rate-limit.window-minutes:15}") int windowMinutes) {
        this(maxRequests, Duration.ofMinutes(windowMinutes));
    }

    public ResetRequestRateLimiter(int maxRequests, Duration window) {
        this.maxRequests = maxRequests;
        this.window = window;
    }

    /** Records an attempt and returns true if it is allowed; false once the window is full. */
    public boolean tryAcquire(String normalizedEmail, Instant now) {
        if (hits.size() > PRUNE_THRESHOLD) {
            prune(now);
        }
        Deque<Instant> q = hits.computeIfAbsent(normalizedEmail, k -> new ArrayDeque<>());
        synchronized (q) {
            Instant cutoff = now.minus(window);
            while (!q.isEmpty() && !q.peekFirst().isAfter(cutoff)) {
                q.pollFirst();
            }
            if (q.size() >= maxRequests) {
                return false;
            }
            q.addLast(now);
            return true;
        }
    }

    private void prune(Instant now) {
        Instant cutoff = now.minus(window);
        hits.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                Instant newest = e.getValue().peekLast();
                return newest == null || !newest.isAfter(cutoff);
            }
        });
    }
}
