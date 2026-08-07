package com.nforceone.sync.reports.dto;

import java.math.BigDecimal;
import java.util.List;

public record EodByEmployeeReportDto(
        int employeeCount,
        int entryCount,
        BigDecimal totalHours,
        List<EodByEmployeeRowDto> employees) {
}
