package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record ResourceUtilizationRowDto(
        Long employeeId,
        String employeeName,
        String projectName,
        BigDecimal productiveHours,
        BigDecimal availableHours,
        BigDecimal utilizationPct
) {}
