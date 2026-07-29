package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * In-place edit of one allocation row.
 *
 * <p>Employee and project are intentionally absent — repointing an allocation at a different
 * person or project is a different allocation, and rewriting it would misattribute any EOD
 * hours already logged under the original pairing.
 *
 * <p>{@code allocationType} is taken as a String and parsed in the service so an unrecognised
 * value yields a 400 rather than a deserialisation failure.
 */
public record UpdateAllocationRequest(
        @NotNull @Min(1) @Max(100) Integer allocationPct,
        @NotBlank String allocationType,
        @NotNull LocalDate effectiveFrom,
        LocalDate effectiveTo
) {}
