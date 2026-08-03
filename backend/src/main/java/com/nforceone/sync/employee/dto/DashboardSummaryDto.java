package com.nforceone.sync.employee.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record DashboardSummaryDto(
        CutoffStatus cutoffStatus,
        QuickStats quickStats,
        List<BlockedTask> blockedTasks,
        List<RecentEntry> recentEntries,
        List<CalendarDay> calendarData
) {

    public record CutoffStatus(
            LocalDate today,
            String entryStatus,
            boolean cutoffPassed,
            LocalTime cutoffTime
    ) {}

    public record QuickStats(
            BigDecimal weekApprovedHours,
            BigDecimal monthAvgUtil,
            int streak,
            int daysSinceLastIssue
    ) {}

    public record BlockedTask(
            Long entryId,
            LocalDate entryDate,
            String projectName,
            String description,
            String blockerReason
    ) {}

    public record RecentEntry(
            Long id,
            LocalDate date,
            String status,
            BigDecimal totalHours,
            int blockedTaskCount,
            BigDecimal utilizationPct
    ) {}

    public record CalendarDay(
            LocalDate date,
            String status,
            BigDecimal utilizationPct,
            boolean isWeekend,
            boolean isFuture
    ) {}
}
