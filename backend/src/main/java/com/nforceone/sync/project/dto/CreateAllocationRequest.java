package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Assigns one employee to one project for a date range at a given capacity share. A null
 * {@code effectiveTo} means the assignment is open-ended.
 *
 * <p>{@code allocationPct} is checked only for presence here — the bounds-and-multiple-of-10 rule
 * and the employee's total-capacity rule are both enforced in {@code AllocationService}, so every
 * rejection (whichever rule failed) reads as the one same message instead of two different ones
 * depending on which layer caught it.
 */
public record CreateAllocationRequest(
        @NotNull Long employeeId,
        @NotNull Long projectId,
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo,
        @NotNull(message = "Allocation % is required")
        Integer allocationPct
) {}
