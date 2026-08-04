package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * In-place edit of an allocation's date range and percentage. Employee and project are
 * intentionally absent — repointing an allocation at a different person or project is a
 * different allocation, and rewriting it would misattribute any EOD hours logged under the
 * original pairing. A null {@code allocationPct} defaults to 100 (full-time).
 */
public record UpdateAllocationRequest(
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo,
        @Min(1) @Max(100) Integer allocationPct
) {}
