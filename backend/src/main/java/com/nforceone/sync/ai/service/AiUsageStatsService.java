package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.dto.AiUsageBreakdownPoint;
import com.nforceone.sync.ai.dto.AiUsageDailyPoint;
import com.nforceone.sync.ai.dto.AiUsageStatsResponse;
import com.nforceone.sync.ai.repository.AiInteractionLogRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Real usage/billing telemetry from {@code ai_interaction_log}, aggregated entirely in SQL
 * (I16 — OneHR's equivalent loaded every row in the window into a Java list first).
 */
@Service
public class AiUsageStatsService {

    private static final int MIN_DAYS = 1;
    private static final int MAX_DAYS = 90;
    private static final int DEFAULT_DAYS = 30;

    private final AiInteractionLogRepository repository;

    public AiUsageStatsService(AiInteractionLogRepository repository) {
        this.repository = repository;
    }

    public AiUsageStatsResponse getStats(Integer requestedDays) {
        int days = clamp(requestedDays == null ? DEFAULT_DAYS : requestedDays);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate windowStart = today.minusDays(days - 1L);
        OffsetDateTime since = windowStart.atStartOfDay().atOffset(ZoneOffset.UTC);

        var totals = repository.aggregateTotals(since);
        List<AiUsageDailyPoint> daily = zeroFilledDailySeries(windowStart, today, since);
        List<AiUsageBreakdownPoint> byError = repository.errorCodeBreakdown(since).stream()
                .map(p -> new AiUsageBreakdownPoint(p.getKey(), p.getCount())).toList();
        List<AiUsageBreakdownPoint> byType = repository.responseTypeBreakdown(since).stream()
                .map(p -> new AiUsageBreakdownPoint(p.getKey(), p.getCount())).toList();

        long promptTokens = nz(totals.getTotalPromptTokens());
        long completionTokens = nz(totals.getTotalCompletionTokens());
        long embeddingTokens = nz(totals.getTotalEmbeddingTokens());

        return new AiUsageStatsResponse(
                days,
                nz(totals.getTotalAttempts()),
                nz(totals.getTotalTurns()),
                nz(totals.getSuccessCount()),
                nz(totals.getErrorCount()),
                promptTokens,
                completionTokens,
                embeddingTokens,
                promptTokens + completionTokens + embeddingTokens,
                totals.getAvgLatencyMs() == null ? 0.0 : totals.getAvgLatencyMs(),
                daily,
                byError,
                byType);
    }

    private List<AiUsageDailyPoint> zeroFilledDailySeries(LocalDate windowStart, LocalDate today, OffsetDateTime since) {
        Map<LocalDate, AiInteractionLogRepository.DailyPointProjection> byDate = new HashMap<>();
        for (var point : repository.dailySeries(since)) {
            byDate.put(point.getDay(), point);
        }
        List<AiUsageDailyPoint> series = new ArrayList<>();
        for (LocalDate date = windowStart; !date.isAfter(today); date = date.plusDays(1)) {
            var point = byDate.get(date);
            series.add(point == null
                    ? new AiUsageDailyPoint(date, 0, 0, 0, 0, 0, 0)
                    : new AiUsageDailyPoint(date, nz(point.getRequestCount()), nz(point.getSuccessCount()),
                            nz(point.getErrorCount()), nz(point.getPromptTokens()), nz(point.getCompletionTokens()),
                            nz(point.getEmbeddingTokens())));
        }
        return series;
    }

    private static int clamp(int days) {
        return Math.max(MIN_DAYS, Math.min(MAX_DAYS, days));
    }

    private static long nz(Long value) {
        return value == null ? 0L : value;
    }
}
