package com.nforceone.sync.plannedactual.dto;

import java.math.BigDecimal;

/**
 * Top-of-page summary cards. Percentages are derived from aggregated hours
 * (total hours / total available hours), never averaged across rows.
 */
public record PlannedVsActualCardsDto(
        BigDecimal plannedHours,
        BigDecimal actualHours,
        BigDecimal plannedUtilizationPct,
        BigDecimal actualUtilizationPct,
        BigDecimal varianceHours,
        BigDecimal variancePct,
        int projectCount,
        int resourceCount
) {}
