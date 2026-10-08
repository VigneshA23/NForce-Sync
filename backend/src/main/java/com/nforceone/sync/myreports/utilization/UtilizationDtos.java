package com.nforceone.sync.myreports.utilization;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Response shapes for the Team Utilization page. All read-only. */
public final class UtilizationDtos {

    private UtilizationDtos() {}

    /** The configured Business Rules values every classification was made against. */
    public record Thresholds(BigDecimal underPct, BigDecimal overPct) {}

    public record StatusCounts(int optimal, int under, int over, int none) {}

    public record MemberUtilizationDto(
            Long id,
            String fullName,
            String employeeCode,
            String email,
            UtilizationStatus status,
            /** Null only for "unavailable" members. */
            BigDecimal utilizationPct,
            /** Approved productive hours over the period. */
            BigDecimal hours,
            /** hours ÷ available days; the "Avg / day" column on Week and Month. Null when unavailable. */
            BigDecimal avgHoursPerDay,
            int availableDays,
            /** Available days that have a submitted EOD. */
            int loggedDays,
            /** A submitted EOD is still awaiting approval. Display hint only — never changes {@code status}. */
            boolean hasPendingApproval
    ) {}

    public record UtilizationSummaryDto(
            String period,
            /** True when the current month has no completed day to show yet (members/counts are then empty). */
            boolean noCompletedDays,
            /** Week tab only: showing the last completed week because the current one has no completed day yet. */
            boolean weekFallback,
            LocalDate from,
            LocalDate to,
            LocalDate previousFrom,
            LocalDate previousTo,
            Thresholds thresholds,
            BigDecimal standardHoursPerDay,
            /** Mean over every member with an available day, 0% members included. Null if nobody qualifies. */
            BigDecimal averageUtilizationPct,
            BigDecimal previousAverageUtilizationPct,
            /** averageUtilizationPct − previousAverageUtilizationPct, in percentage points; null if either is null. */
            BigDecimal deltaPoints,
            StatusCounts counts,
            /** Members with no available day in the period ("N on leave"). Not in the average or the four counts. */
            int excludedCount,
            /** counts (4) + excludedCount == totalMembers, always. */
            int totalMembers,
            List<MemberUtilizationDto> members
    ) {}

    public record UtilizationDayDto(
            LocalDate date,
            boolean weekend,
            boolean holiday,
            boolean future,
            boolean today,
            /** Approved full-day leave. Leave days stay clickable and carry a "Leave" badge. */
            boolean leave,
            /** Weekend / holiday / future days are not selectable. */
            boolean selectable,
            /** Null when the day isn't selectable; "unavailable" for a leave day. */
            UtilizationStatus status,
            BigDecimal utilizationPct,
            BigDecimal hours,
            boolean hasSubmittedEntry,
            boolean hasPendingApproval
    ) {}

    public record UtilizationDaysDto(
            Long employeeId,
            LocalDate from,
            LocalDate to,
            Thresholds thresholds,
            BigDecimal standardHoursPerDay,
            /** Mean of the per-day percentages over elapsed available days (0% days included). */
            BigDecimal averageUtilizationPct,
            List<UtilizationDayDto> days
    ) {}

    public record UtilizationEntryDto(
            Long taskId,
            String projectCode,
            String projectName,
            String category,
            String description,
            BigDecimal hours,
            /** task_category.is_productive — what utilization counts. There is no billable flag in the system. */
            boolean productive
    ) {}

    public record UtilizationEntriesDto(
            Long employeeId,
            String fullName,
            String employeeCode,
            LocalDate date,
            boolean weekend,
            boolean holiday,
            boolean leave,
            /** EodEntry.DayType name of the submitted entry; null when there is none. */
            String dayType,
            /** SUBMITTED / PARTIALLY_APPROVED / APPROVED. Null when nothing has been submitted (drafts never show). */
            String entryStatus,
            UtilizationStatus status,
            BigDecimal utilizationPct,
            BigDecimal approvedProductiveHours,
            /** Sum of every listed entry's hours. */
            BigDecimal totalHours,
            boolean hasPendingApproval,
            Thresholds thresholds,
            BigDecimal standardHoursPerDay,
            List<UtilizationEntryDto> entries
    ) {}
}
