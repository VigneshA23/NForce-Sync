package com.nforceone.sync.reports.dto;

import java.math.BigDecimal;
import java.util.List;

public record EodByEmployeeRowDto(
        Long employeeId,
        String employeeName,
        String employeeCode,
        String designationName,
        List<String> projectCodes,
        String client,
        String managerName,
        String status,
        int entryCount,
        BigDecimal totalHours,
        List<EodByEmployeeEntryDto> entries) {
}
