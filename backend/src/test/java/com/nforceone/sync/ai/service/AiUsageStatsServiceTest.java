package com.nforceone.sync.ai.service;

import com.nforceone.sync.ai.dto.AiUsageStatsResponse;
import com.nforceone.sync.ai.repository.AiInteractionLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiUsageStatsServiceTest {

    private AiInteractionLogRepository repository;
    private AiUsageStatsService service;

    @BeforeEach
    void setUp() {
        repository = mock(AiInteractionLogRepository.class);
        service = new AiUsageStatsService(repository);
        when(repository.dailySeries(any())).thenReturn(List.of());
        when(repository.errorCodeBreakdown(any())).thenReturn(List.of());
        when(repository.responseTypeBreakdown(any())).thenReturn(List.of());
    }

    private static AiInteractionLogRepository.UsageTotalsProjection totals(long attempts, long turns,
            long success, long errors, long prompt, long completion, long embedding, Double avgLatency) {
        return new AiInteractionLogRepository.UsageTotalsProjection() {
            @Override public Long getTotalAttempts() { return attempts; }
            @Override public Long getTotalTurns() { return turns; }
            @Override public Long getSuccessCount() { return success; }
            @Override public Long getErrorCount() { return errors; }
            @Override public Long getTotalPromptTokens() { return prompt; }
            @Override public Long getTotalCompletionTokens() { return completion; }
            @Override public Long getTotalEmbeddingTokens() { return embedding; }
            @Override public Double getAvgLatencyMs() { return avgLatency; }
        };
    }

    @Test
    void daysDefaultsTo30() {
        when(repository.aggregateTotals(any())).thenReturn(totals(0, 0, 0, 0, 0, 0, 0, null));
        AiUsageStatsResponse response = service.getStats(null);
        assertEquals(30, response.days());
    }

    @Test
    void daysIsClampedToAtLeast1() {
        when(repository.aggregateTotals(any())).thenReturn(totals(0, 0, 0, 0, 0, 0, 0, null));
        assertEquals(1, service.getStats(0).days());
        assertEquals(1, service.getStats(-5).days());
    }

    @Test
    void daysIsClampedToAtMost90() {
        when(repository.aggregateTotals(any())).thenReturn(totals(0, 0, 0, 0, 0, 0, 0, null));
        assertEquals(90, service.getStats(365).days());
    }

    @Test
    void totalsAreSummedFromPromptCompletionAndEmbeddingTokens() {
        when(repository.aggregateTotals(any())).thenReturn(totals(10, 8, 7, 1, 1000, 500, 200, 250.5));
        AiUsageStatsResponse response = service.getStats(7);

        assertEquals(10, response.totalRequests());
        assertEquals(8, response.totalTurns());
        assertEquals(7, response.successCount());
        assertEquals(1, response.errorCount());
        assertEquals(1700, response.totalTokens());
        assertEquals(250.5, response.avgLatencyMs());
    }

    @Test
    void nullAggregatesBecomeZeroNeverNullPointerOrNegative() {
        when(repository.aggregateTotals(any())).thenReturn(totals(0, 0, 0, 0, 0, 0, 0, null));
        AiUsageStatsResponse response = service.getStats(7);
        assertEquals(0, response.totalRequests());
        assertEquals(0.0, response.avgLatencyMs());
    }

    @Test
    void dailySeriesIsZeroFilledForDaysWithNoRows() {
        when(repository.aggregateTotals(any())).thenReturn(totals(0, 0, 0, 0, 0, 0, 0, null));
        AiUsageStatsResponse response = service.getStats(3);
        assertEquals(3, response.daily().size());
        assertTrue(response.daily().stream().allMatch(d -> d.requestCount() == 0));
        // Consecutive dates, ending today (UTC).
        LocalDate today = LocalDate.now(java.time.ZoneOffset.UTC);
        assertEquals(today, response.daily().get(response.daily().size() - 1).date());
        assertEquals(today.minusDays(2), response.daily().get(0).date());
    }
}
