package com.nforceone.sync.employee.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record UtilizationDetailDto(
        List<WeekTrend> weeklyTrend,
        CurrentPeriod currentPeriod,
        CategoryBreakdown categoryBreakdown,
        List<HistoryDay> history
) {

    public record WeekTrend(
            LocalDate weekStart,
            LocalDate weekEnd,
            BigDecimal avgUtilPct,
            BigDecimal totalApproved,
            BigDecimal totalAvailable,
            int workingDays,
            int approvedDays
    ) {}

    public record CurrentPeriod(
            LocalDate from,
            LocalDate to,
            BigDecimal avgUtilPct,
            BigDecimal totalApproved,
            BigDecimal totalAvailable,
            int workingDays,
            int approvedDays
    ) {}

    public record CategoryBreakdown(
            BigDecimal billableHours,
            BigDecimal nonBillableHours,
            BigDecimal benchHours,
            BigDecimal totalApproved
    ) {}

    public record HistoryDay(
            LocalDate date,
            BigDecimal availableHours,
            BigDecimal approvedHours,
            BigDecimal billableHours,
            BigDecimal nonBillableHours,
            BigDecimal benchHours,
            BigDecimal utilizationPct
    ) {}
}
