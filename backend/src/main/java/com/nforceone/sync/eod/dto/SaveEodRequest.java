package com.nforceone.sync.eod.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

public record SaveEodRequest(
        @NotNull(message = "Entry date is required")
        LocalDate entryDate,

        String workLocation,
        String nextDayPlan,
        String remarks,

        List<SaveEodTaskRequest> tasks
) {}
