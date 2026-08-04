package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Assigns one employee to one project for a date range. A null {@code effectiveTo} means the
 * assignment is open-ended. A null {@code allocationPct} defaults to 100 (full-time).
 */
public record CreateAllocationRequest(
        @NotNull Long employeeId,
        @NotNull Long projectId,
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo,
        @Min(1) @Max(100) Integer allocationPct
) {}
