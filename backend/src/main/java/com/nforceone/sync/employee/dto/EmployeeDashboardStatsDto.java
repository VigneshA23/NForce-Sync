package com.nforceone.sync.employee.dto;

import java.time.LocalDate;
import java.util.List;

public record EmployeeDashboardStatsDto(
        TodayStatusDto todayStatus,
        List<PendingCorrectionDto> pendingCorrections,
        List<LocalDate> missedDates,
        int missedCount
) {}
