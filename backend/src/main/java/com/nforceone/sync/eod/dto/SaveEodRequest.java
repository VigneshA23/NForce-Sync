package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodEntry;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

public record SaveEodRequest(
        @NotNull(message = "Entry date is required")
        LocalDate entryDate,

        /** Null is tolerated and treated as WORKING_DAY, so older clients keep working. */
        EodEntry.DayType dayType,

        /** Time adjustment, WORKING_DAY only. Both null when none is requested. */
        EodEntry.TimeAdjustmentType timeAdjustmentType,
        Integer timeAdjustmentMinutes,

        String workLocation,
        String nextDayPlan,
        String remarks,

        List<SaveEodTaskRequest> tasks
) {}
