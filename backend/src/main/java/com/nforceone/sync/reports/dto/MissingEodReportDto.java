package com.nforceone.sync.reports.dto;

import java.util.List;

public record MissingEodReportDto(int employeeCount, int totalMissingDays, List<MissingEodRowDto> employees) {
}
