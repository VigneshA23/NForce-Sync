package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record PlannedVsActualDto(
        BigDecimal plannedHours,
        BigDecimal actualHours,
        BigDecimal variance,
        BigDecimal variancePct
) {}
