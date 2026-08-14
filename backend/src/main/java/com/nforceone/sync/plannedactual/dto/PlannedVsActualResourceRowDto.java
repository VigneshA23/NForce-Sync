package com.nforceone.sync.plannedactual.dto;

import java.math.BigDecimal;

public record PlannedVsActualResourceRowDto(
        Long employeeId,
        String employeeName,
        Long projectId,
        String projectName,
        BigDecimal plannedHours,
        BigDecimal actualHours,
        BigDecimal plannedUtilizationPct,
        BigDecimal actualUtilizationPct,
        BigDecimal varianceHours,
        BigDecimal variancePct,
        /** ABOVE_PLAN / ON_PLAN / BELOW_PLAN — exact comparison of actual vs planned hours. */
        String status
) {}
