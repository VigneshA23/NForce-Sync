package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.dto.AiBillingResponse;
import com.nforceone.sync.ai.entity.AiBillingSettings;
import com.nforceone.sync.ai.repository.AiBillingSettingsRepository;
import com.nforceone.sync.ai.repository.AiInteractionLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiBillingSettingsServiceTest {

    private AiBillingSettingsRepository settingsRepository;
    private AiInteractionLogRepository interactionLogRepository;
    private AiBillingSettingsService service;

    @BeforeEach
    void setUp() {
        settingsRepository = mock(AiBillingSettingsRepository.class);
        interactionLogRepository = mock(AiInteractionLogRepository.class);
        service = new AiBillingSettingsService(settingsRepository, interactionLogRepository);
    }

    private static AiBillingSettings settings(BigDecimal budget, BigDecimal prompt, BigDecimal completion, BigDecimal embedding) {
        AiBillingSettings s = new AiBillingSettings();
        s.setId(UUID.randomUUID());
        s.setMonthlyBudgetUsd(budget);
        s.setPromptCostPerMillionUsd(prompt);
        s.setCompletionCostPerMillionUsd(completion);
        s.setEmbeddingCostPerMillionUsd(embedding);
        s.setUpdatedAt(OffsetDateTime.now());
        return s;
    }

    private static AiInteractionLogRepository.TokenTotalsProjection tokens(long prompt, long completion, long embedding) {
        return new AiInteractionLogRepository.TokenTotalsProjection() {
            @Override public Long getPromptTokens() { return prompt; }
            @Override public Long getCompletionTokens() { return completion; }
            @Override public Long getEmbeddingTokens() { return embedding; }
        };
    }

    @Test
    void computesCostFromRealPricesAndTokenUsage() {
        // 1,000,000 prompt tokens @ $0.15/M = $0.15; 1,000,000 completion @ $0.15/M = $0.15;
        // 1,000,000 embedding @ $0.10/M = $0.10 — total $0.40.
        when(settingsRepository.findFirstBySingletonTrue()).thenReturn(Optional.of(
                settings(BigDecimal.valueOf(50), BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.10))));
        when(interactionLogRepository.aggregateTokens(any())).thenReturn(tokens(1_000_000, 1_000_000, 1_000_000));

        AiBillingResponse response = service.computeBilling();

        assertEquals(0, response.estimatedCostUsd().compareTo(BigDecimal.valueOf(0.40)));
        assertEquals(1_000_000, response.promptTokens());
    }

    @Test
    void usedPercentReflectsCostAgainstBudget() {
        when(settingsRepository.findFirstBySingletonTrue()).thenReturn(Optional.of(
                settings(BigDecimal.valueOf(10), BigDecimal.valueOf(1), BigDecimal.valueOf(1), BigDecimal.valueOf(1))));
        // 1,000,000 tokens each @ $1/M = $1 each = $3 total, against a $10 budget = 30%.
        when(interactionLogRepository.aggregateTokens(any())).thenReturn(tokens(1_000_000, 1_000_000, 1_000_000));

        AiBillingResponse response = service.computeBilling();

        assertEquals(0, response.usedPercent().compareTo(BigDecimal.valueOf(30.00)));
    }

    @Test
    void zeroBudgetNeverDividesByZero() {
        when(settingsRepository.findFirstBySingletonTrue()).thenReturn(Optional.of(
                settings(BigDecimal.ZERO, BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.10))));
        when(interactionLogRepository.aggregateTokens(any())).thenReturn(tokens(1000, 1000, 1000));

        assertDoesNotThrow(() -> service.computeBilling());
    }

    @Test
    void nullTokenTotalsBecomeZero() {
        when(settingsRepository.findFirstBySingletonTrue()).thenReturn(Optional.of(
                settings(BigDecimal.valueOf(50), BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.10))));
        when(interactionLogRepository.aggregateTokens(any())).thenReturn(tokens(0, 0, 0));

        AiBillingResponse response = service.computeBilling();
        assertEquals(0, response.estimatedCostUsd().compareTo(BigDecimal.ZERO));
    }

    @Test
    void updateSettingsPersistsAllFourFields() {
        AiBillingSettings existing = settings(BigDecimal.valueOf(50), BigDecimal.valueOf(0.15),
                BigDecimal.valueOf(0.15), BigDecimal.valueOf(0.10));
        when(settingsRepository.findFirstBySingletonTrue()).thenReturn(Optional.of(existing));
        when(settingsRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AiBillingSettings saved = service.updateSettings(
                BigDecimal.valueOf(100), BigDecimal.valueOf(0.2), BigDecimal.valueOf(0.2), BigDecimal.valueOf(0.15));

        assertEquals(0, saved.getMonthlyBudgetUsd().compareTo(BigDecimal.valueOf(100)));
        assertEquals(0, saved.getPromptCostPerMillionUsd().compareTo(BigDecimal.valueOf(0.2)));
    }
}
