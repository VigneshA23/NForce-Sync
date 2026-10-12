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
            LocalTime cutoffTime,
            /** True when the cutoff lands on the day AFTER `today`, as it does for a shift that
             *  crosses midnight (15:30-00:30 with a 00:30 cutoff). Without this the UI shows a
             *  bare "00:30" that reads as though the deadline already passed this morning. */
            boolean cutoffNextDay,
            /** The server's clock when this was computed (same zone as {@code cutoffTime}), so the UI can count
             *  down to the cutoff from SERVER time instead of trusting the browser's clock. */
            java.time.LocalDateTime serverNow
    ) {}

    public record QuickStats(
            BigDecimal weekApprovedHours,
            BigDecimal monthAvgUtil,
            int streak,
            int daysSinceLastIssue
    ) {}

    public record BlockedTask(
            Long taskId,
            Long entryId,
            LocalDate entryDate,
            String projectName,
            String categoryName,
            String description,
            String blockerReason,
            boolean acknowledged,
            java.time.OffsetDateTime acknowledgedAt,
            String acknowledgedByName,
            String status,              // "NEEDS_RESPONSE" | "ACKNOWLEDGED" | "RESOLVED" — same
                                         // derivation as TeamBlockerDto.status (EodTask.getBlockerStatus())
            java.time.OffsetDateTime resolvedAt,
            String resolvedByName
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
            boolean isFuture,
            boolean isHoliday,
            String holidayName
    ) {}
}
