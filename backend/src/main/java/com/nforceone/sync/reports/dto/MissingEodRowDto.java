package com.nforceone.sync.reports.dto;

import java.math.BigDecimal;
import java.util.List;

public record MissingEodRowDto(
        Long employeeId,
        String employeeName,
        String employeeCode,
        String designationName,
        String projectName,
        String teamName,
        int missingCount,
        int totalWorkingDays,
        BigDecimal missingPct,
        String status,
        List<MissingEodDayDto> days) {
}
