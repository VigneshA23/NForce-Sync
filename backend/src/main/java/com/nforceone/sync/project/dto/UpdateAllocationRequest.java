package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * In-place edit of an allocation's date range. Employee and project are intentionally absent —
 * repointing an allocation at a different person or project is a different allocation, and
 * rewriting it would misattribute any EOD hours logged under the original pairing.
 */
public record UpdateAllocationRequest(
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo
) {}
