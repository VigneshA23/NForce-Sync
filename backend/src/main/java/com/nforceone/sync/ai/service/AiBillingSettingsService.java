package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.dto.AiBillingResponse;
import com.nforceone.sync.ai.entity.AiBillingSettings;
import com.nforceone.sync.ai.repository.AiBillingSettingsRepository;
import com.nforceone.sync.ai.repository.AiInteractionLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Reads/writes the singleton {@code ai_billing_settings} row and computes the month-to-date
 * cost estimate. Explicitly an estimate: real provider billing may differ (rounding, provider-side
 * discounts, pricing changes not yet reflected here).
 */
@Service
public class AiBillingSettingsService {

    private static final BigDecimal ONE_MILLION = BigDecimal.valueOf(1_000_000);

    private final AiBillingSettingsRepository settingsRepository;
    private final AiInteractionLogRepository interactionLogRepository;

    public AiBillingSettingsService(AiBillingSettingsRepository settingsRepository,
            AiInteractionLogRepository interactionLogRepository) {
        this.settingsRepository = settingsRepository;
        this.interactionLogRepository = interactionLogRepository;
    }

    public AiBillingSettings getSettings() {
        return settingsRepository.findFirstBySingletonTrue()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "AI billing settings row is missing"));
    }

    public AiBillingSettings updateSettings(BigDecimal monthlyBudgetUsd, BigDecimal promptCostPerMillionUsd,
            BigDecimal completionCostPerMillionUsd, BigDecimal embeddingCostPerMillionUsd) {
        AiBillingSettings settings = getSettings();
        settings.setMonthlyBudgetUsd(monthlyBudgetUsd);
        settings.setPromptCostPerMillionUsd(promptCostPerMillionUsd);
        settings.setCompletionCostPerMillionUsd(completionCostPerMillionUsd);
        settings.setEmbeddingCostPerMillionUsd(embeddingCostPerMillionUsd);
        settings.setUpdatedAt(OffsetDateTime.now());
        return settingsRepository.save(settings);
    }

    public AiBillingResponse computeBilling() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate monthStart = today.withDayOfMonth(1);
        OffsetDateTime since = monthStart.atStartOfDay().atOffset(ZoneOffset.UTC);

        var tokens = interactionLogRepository.aggregateTokens(since);
        long promptTokens = nz(tokens.getPromptTokens());
        long completionTokens = nz(tokens.getCompletionTokens());
        long embeddingTokens = nz(tokens.getEmbeddingTokens());

        AiBillingSettings settings = getSettings();
        BigDecimal cost = costOf(promptTokens, settings.getPromptCostPerMillionUsd())
                .add(costOf(completionTokens, settings.getCompletionCostPerMillionUsd()))
                .add(costOf(embeddingTokens, settings.getEmbeddingCostPerMillionUsd()))
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal usedPercent = settings.getMonthlyBudgetUsd().signum() == 0
                ? BigDecimal.ZERO
                : cost.divide(settings.getMonthlyBudgetUsd(), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);

        return new AiBillingResponse(monthStart, today, promptTokens, completionTokens, embeddingTokens,
                settings.getMonthlyBudgetUsd(), cost, usedPercent);
    }

    private static BigDecimal costOf(long tokens, BigDecimal pricePerMillion) {
        return BigDecimal.valueOf(tokens).multiply(pricePerMillion).divide(ONE_MILLION, 6, RoundingMode.HALF_UP);
    }

    private static long nz(Long value) {
        return value == null ? 0L : value;
    }
}
