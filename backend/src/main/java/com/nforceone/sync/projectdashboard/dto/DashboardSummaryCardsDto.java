package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record DashboardSummaryCardsDto(
        int totalAssignedProjects,
        int activeProjects,
        int onHoldProjects,
        int completedProjects,
        BigDecimal overallUtilizationPct,
        BigDecimal billableUtilizationPct,
        BigDecimal nonBillableUtilizationPct,
        BigDecimal plannedUtilizationPct,
        BigDecimal actualUtilizationPct,
        int missingEodCount
) {}
