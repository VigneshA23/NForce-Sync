package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * In-place edit of an allocation's date range and capacity share. Employee and project are
 * intentionally absent — repointing an allocation at a different person or project is a different
 * allocation, and rewriting it would misattribute any EOD hours logged under the original pairing.
 *
 * <p>A genuine percentage change effective from some future date should normally be modeled as
 * ending this row (set its {@code effectiveTo}) and creating a new allocation row for the new
 * share — that is what keeps historical Planned vs Actual reports reading the percentage that was
 * actually in effect at the time, since a report resolves whichever row's date window covers the
 * reporting period. This endpoint still allows editing an existing row's own percentage (e.g. to
 * correct a data-entry mistake) — nothing in the schema distinguishes "correction" from "change
 * over time"; that judgment call is left to the PM.
 */
public record UpdateAllocationRequest(
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo,
        @NotNull(message = "Allocation % is required")
        Integer allocationPct
) {}
