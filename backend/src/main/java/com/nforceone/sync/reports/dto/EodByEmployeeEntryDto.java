package com.nforceone.sync.reports.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record EodByEmployeeEntryDto(
        Long entryId,
        LocalDate date,
        String projectCode,
        String categoryName,
        BigDecimal hours,
        boolean billable) {
}
