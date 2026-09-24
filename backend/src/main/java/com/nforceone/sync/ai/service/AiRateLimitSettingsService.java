package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.entity.AiRateLimitSettings;
import com.nforceone.sync.ai.repository.AiRateLimitSettingsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reads and writes the singleton {@code ai_rate_limit_settings} row, with a short in-memory
 * cache on the enforcement read path. Mirrors OneHR's semantics: a settings-read failure must
 * never be the reason the assistant stops working, so {@link #currentForEnforcement()} always
 * returns something usable — the last-known-good cached value, or a safe built-in default if
 * nothing has ever been cached.
 */
@Service
public class AiRateLimitSettingsService {

    private static final Logger log = LoggerFactory.getLogger(AiRateLimitSettingsService.class);
    private static final Duration CACHE_TTL = Duration.ofSeconds(30);
    private static final RateLimitConfig SAFE_DEFAULT = new RateLimitConfig(true, 60, 60);

    public record RateLimitConfig(boolean enabled, int requestsPerWindow, int windowMinutes) {
    }

    private record Cached(RateLimitConfig config, Instant fetchedAt) {
    }

    private final AiRateLimitSettingsRepository repository;
    private final AtomicReference<Cached> cache = new AtomicReference<>();

    public AiRateLimitSettingsService(AiRateLimitSettingsRepository repository) {
        this.repository = repository;
    }

    /** The value {@link com.nforceone.sync.ai.service.AiRateLimiter} enforces against — always returns, never throws. */
    public RateLimitConfig currentForEnforcement() {
        Cached cached = cache.get();
        if (cached != null && Duration.between(cached.fetchedAt(), Instant.now()).compareTo(CACHE_TTL) < 0) {
            return cached.config();
        }
        try {
            RateLimitConfig fresh = repository.findFirstBySingletonTrue()
                    .map(s -> new RateLimitConfig(s.isEnabled(), s.getRequestsPerWindow(), s.getWindowMinutes()))
                    .orElseGet(() -> cached != null ? cached.config() : SAFE_DEFAULT);
            cache.set(new Cached(fresh, Instant.now()));
            return fresh;
        } catch (RuntimeException e) {
            log.warn("Could not read ai_rate_limit_settings; serving {}", cached != null ? "last-known-good" : "safe default", e);
            return cached != null ? cached.config() : SAFE_DEFAULT;
        }
    }

    /** For GET /admin/rate-limit-settings — the real row, not the cache, so an admin always sees the true current value. */
    public AiRateLimitSettings getSettings() {
        return repository.findFirstBySingletonTrue()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "AI rate limit settings row is missing"));
    }

    /** For PUT /admin/rate-limit-settings. Bounds match the DB CHECK constraints in V95. */
    public AiRateLimitSettings updateSettings(boolean enabled, int requestsPerWindow, int windowMinutes) {
        if (requestsPerWindow < 1 || requestsPerWindow > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "requestsPerWindow must be between 1 and 1000");
        }
        if (windowMinutes < 1 || windowMinutes > 1440) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "windowMinutes must be between 1 and 1440");
        }
        AiRateLimitSettings settings = getSettings();
        settings.setEnabled(enabled);
        settings.setRequestsPerWindow(requestsPerWindow);
        settings.setWindowMinutes(windowMinutes);
        settings.setUpdatedAt(OffsetDateTime.now());
        AiRateLimitSettings saved = repository.save(settings);
        cache.set(null); // force the next enforcement read to pick up the change immediately on this instance
        return saved;
    }
}
