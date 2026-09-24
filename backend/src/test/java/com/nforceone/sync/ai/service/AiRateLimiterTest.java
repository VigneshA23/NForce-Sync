package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.exception.AiRateLimitExceededException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiRateLimiterTest {

    private AiRateLimitSettingsService settingsService;
    private AiRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        settingsService = mock(AiRateLimitSettingsService.class);
        rateLimiter = new AiRateLimiter(settingsService);
    }

    private void configure(boolean enabled, int requestsPerWindow, int windowMinutes) {
        when(settingsService.currentForEnforcement())
                .thenReturn(new AiRateLimitSettingsService.RateLimitConfig(enabled, requestsPerWindow, windowMinutes));
    }

    @Test
    void allowsRequestsUnderTheLimit() {
        configure(true, 3, 60);
        assertDoesNotThrow(() -> rateLimiter.checkAndRecord(1L));
        assertDoesNotThrow(() -> rateLimiter.checkAndRecord(1L));
        assertDoesNotThrow(() -> rateLimiter.checkAndRecord(1L));
    }

    @Test
    void rejectsTheRequestThatExceedsTheLimit() {
        configure(true, 2, 60);
        rateLimiter.checkAndRecord(1L);
        rateLimiter.checkAndRecord(1L);
        AiRateLimitExceededException ex = assertThrows(AiRateLimitExceededException.class,
                () -> rateLimiter.checkAndRecord(1L));
        assertTrue(ex.getRetryAfterSeconds() >= 1);
    }

    @Test
    void tracksEachUserIndependently() {
        configure(true, 1, 60);
        rateLimiter.checkAndRecord(1L);
        assertThrows(AiRateLimitExceededException.class, () -> rateLimiter.checkAndRecord(1L));
        assertDoesNotThrow(() -> rateLimiter.checkAndRecord(2L), "a different user must have their own independent budget");
    }

    @Test
    void disabledConfigAllowsUnlimitedRequests() {
        configure(false, 1, 60);
        for (int i = 0; i < 10; i++) {
            assertDoesNotThrow(() -> rateLimiter.checkAndRecord(1L));
        }
    }

    @Test
    void zeroOrNegativeRequestsPerWindowAllowsUnlimitedRequests() {
        configure(true, 0, 60);
        for (int i = 0; i < 10; i++) {
            assertDoesNotThrow(() -> rateLimiter.checkAndRecord(1L));
        }
    }
}
