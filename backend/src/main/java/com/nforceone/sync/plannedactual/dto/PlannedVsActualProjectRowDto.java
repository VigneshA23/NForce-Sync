package com.nforceone.sync.plannedactual.dto;

import java.math.BigDecimal;

public record PlannedVsActualProjectRowDto(
        Long projectId,
        String projectName,
        BigDecimal plannedHours,
        BigDecimal actualHours,
        BigDecimal plannedUtilizationPct,
        BigDecimal actualUtilizationPct,
        BigDecimal varianceHours,
        BigDecimal variancePct
) {}
