package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * The monthly time-adjustment budget: one pool of minutes shared across late arrival,
 * intervening time-off and early leave. 0 disables time adjustments outright, which is a
 * legitimate configuration.
 *
 * Replaced three per-type use-counts in V62 — counted separately they permitted up to three
 * full 120-minute adjustments a month against a policy meant to grant two hours in total.
 *
 * Capped at 24 hours: the budget is spent within single shifts, so anything beyond a day is a
 * typo rather than a policy.
 */
public record UpdateAllowancesRequest(
        @NotNull @Min(value = 0, message = "Monthly time adjustment budget cannot be negative")
        @Max(value = 1440, message = "Monthly time adjustment budget cannot exceed 1440 minutes (24 hours)")
        Integer monthlyAdjustmentMinutes
) {}
