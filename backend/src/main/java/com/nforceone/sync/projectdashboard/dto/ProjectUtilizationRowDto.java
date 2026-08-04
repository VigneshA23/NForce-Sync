package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record ProjectUtilizationRowDto(
        Long projectId,
        String projectName,
        BigDecimal plannedHours,
        BigDecimal actualHours,
        BigDecimal variance,
        BigDecimal utilizationPct
) {}
