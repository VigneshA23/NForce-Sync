package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Assigns one employee to one project for a date range at a given capacity share. A null
 * {@code effectiveTo} means the assignment is open-ended.
 */
public record CreateAllocationRequest(
        @NotNull Long employeeId,
        @NotNull Long projectId,
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo,
        @NotNull(message = "Allocation % is required")
        @Min(value = 1, message = "Allocation % must be at least 1")
        @Max(value = 100, message = "Allocation % cannot exceed 100")
        Integer allocationPct
) {}
