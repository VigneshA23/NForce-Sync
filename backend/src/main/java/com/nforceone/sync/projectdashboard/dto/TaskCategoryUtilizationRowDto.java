package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record TaskCategoryUtilizationRowDto(
        String category,
        BigDecimal hours,
        BigDecimal pctOfTotal
) {}
