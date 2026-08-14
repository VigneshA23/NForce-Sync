package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record ProjectUtilizationRowDto(
        Long projectId,
        String projectName,
        BigDecimal plannedHours,
        BigDecimal actualHours,
        BigDecimal variance,
        BigDecimal utilizationPct,
        BigDecimal billablePct,
        /** Previous-period utilizationPct for the same project, for the table's trend sparkline.
         *  Null when the project had no allocations in the immediately-preceding period. */
        BigDecimal previousUtilizationPct
) {}
