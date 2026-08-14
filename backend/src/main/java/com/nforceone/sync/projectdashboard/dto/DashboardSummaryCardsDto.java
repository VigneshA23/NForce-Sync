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
        int missingEodCount,
        // ── vs-previous-period deltas (percentage points), null when there is no previous-period
        // data to compare against (e.g. a PM whose portfolio has no prior activity). ──────────────
        BigDecimal overallUtilizationDeltaPct,
        BigDecimal actualUtilizationDeltaPct,
        BigDecimal billableUtilizationDeltaPct,
        BigDecimal nonBillableUtilizationDeltaPct,
        /** Active-project-count delta uses distinct-projects-with-approved-hours as a proxy for
         *  both periods, since Project.status has no history to compare against directly. */
        Integer activeProjectsDelta
) {}
