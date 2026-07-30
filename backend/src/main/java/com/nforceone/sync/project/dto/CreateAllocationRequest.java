package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Assigns one employee to one project for a date range. A null {@code effectiveTo} means the
 * assignment is open-ended.
 */
public record CreateAllocationRequest(
        @NotNull Long employeeId,
        @NotNull Long projectId,
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo
) {}
