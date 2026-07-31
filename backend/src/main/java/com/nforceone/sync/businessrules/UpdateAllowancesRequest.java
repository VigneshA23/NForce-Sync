package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Monthly time-adjustment allowances — how many times per calendar month each type may be
 * used. 0 disables a type outright, which is a legitimate configuration.
 */
public record UpdateAllowancesRequest(
        @NotNull @Min(value = 0, message = "Late arrival allowance cannot be negative")
        @Max(value = 31, message = "Late arrival allowance cannot exceed 31 per month") Integer lateArrivalAllowance,

        @NotNull @Min(value = 0, message = "Early leave allowance cannot be negative")
        @Max(value = 31, message = "Early leave allowance cannot exceed 31 per month") Integer earlyLeaveAllowance,

        @NotNull @Min(value = 0, message = "Intervening time-off allowance cannot be negative")
        @Max(value = 31, message = "Intervening time-off allowance cannot exceed 31 per month") Integer interveningAllowance
) {}
