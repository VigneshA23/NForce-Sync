package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.entity.AiRateLimitSettings;
import com.nforceone.sync.ai.repository.AiRateLimitSettingsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiRateLimitSettingsServiceTest {

    private AiRateLimitSettingsRepository repository;
    private AiRateLimitSettingsService service;

    @BeforeEach
    void setUp() {
        repository = mock(AiRateLimitSettingsRepository.class);
        service = new AiRateLimitSettingsService(repository);
    }

    private static AiRateLimitSettings settings(boolean enabled, int requests, int window) {
        AiRateLimitSettings s = new AiRateLimitSettings();
        s.setId(UUID.randomUUID());
        s.setEnabled(enabled);
        s.setRequestsPerWindow(requests);
        s.setWindowMinutes(window);
        s.setUpdatedAt(OffsetDateTime.now());
        return s;
    }

    @Test
    void readsThroughToTheRepositoryOnAColdCache() {
        when(repository.findFirstBySingletonTrue()).thenReturn(Optional.of(settings(true, 42, 30)));
        var config = service.currentForEnforcement();
        assertTrue(config.enabled());
        assertEquals(42, config.requestsPerWindow());
        assertEquals(30, config.windowMinutes());
    }

    @Test
    void fallsBackToSafeDefaultWhenNothingHasEverBeenCachedAndTheRepositoryFails() {
        when(repository.findFirstBySingletonTrue()).thenThrow(new RuntimeException("db down"));
        var config = service.currentForEnforcement();
        assertTrue(config.enabled());
        assertEquals(60, config.requestsPerWindow());
        assertEquals(60, config.windowMinutes());
    }

    @Test
    void updateRejectsRequestsPerWindowOutOfBounds() {
        assertThrows(ResponseStatusException.class, () -> service.updateSettings(true, 0, 60));
        assertThrows(ResponseStatusException.class, () -> service.updateSettings(true, 1001, 60));
    }

    @Test
    void updateRejectsWindowMinutesOutOfBounds() {
        when(repository.findFirstBySingletonTrue()).thenReturn(Optional.of(settings(true, 60, 60)));
        assertThrows(ResponseStatusException.class, () -> service.updateSettings(true, 60, 0));
        assertThrows(ResponseStatusException.class, () -> service.updateSettings(true, 60, 1441));
    }

    @Test
    void updateSavesWithinBounds() {
        AiRateLimitSettings existing = settings(true, 60, 60);
        when(repository.findFirstBySingletonTrue()).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AiRateLimitSettings saved = service.updateSettings(false, 100, 120);

        assertFalse(saved.isEnabled());
        assertEquals(100, saved.getRequestsPerWindow());
        assertEquals(120, saved.getWindowMinutes());
    }

    @Test
    void getSettingsThrowsWhenTheSingletonRowIsMissing() {
        when(repository.findFirstBySingletonTrue()).thenReturn(Optional.empty());
        assertThrows(ResponseStatusException.class, () -> service.getSettings());
    }
}
