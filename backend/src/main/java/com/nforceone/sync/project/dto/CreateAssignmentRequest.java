package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * One allocation decision for an employee: a required primary project and an optional
 * secondary one, sharing a single effective date range. Produces one or two
 * {@code allocation} rows, written atomically.
 *
 * <p>{@code secondaryProjectId} and {@code secondaryPct} must be supplied together —
 * a cross-field rule, so it is enforced in AllocationService rather than by annotations.
 */
public record CreateAssignmentRequest(
        @NotNull Long employeeId,

        @NotNull Long primaryProjectId,
        @NotNull @Min(1) @Max(100) Integer primaryPct,

        Long secondaryProjectId,
        @Min(1) @Max(100) Integer secondaryPct,

        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo
) {}
