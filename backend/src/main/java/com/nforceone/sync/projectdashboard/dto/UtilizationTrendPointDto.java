package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One day's point on the Utilization Trend chart — overall/billable/non-billable % for that date. */
public record UtilizationTrendPointDto(
        LocalDate date,
        BigDecimal overallPct,
        BigDecimal billablePct,
        BigDecimal nonBillablePct
) {}
