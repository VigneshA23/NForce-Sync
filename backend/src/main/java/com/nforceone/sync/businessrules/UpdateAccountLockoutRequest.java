package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Account Lockout policy: how many consecutive failed sign-ins lock an account, and for how long.
 * Both are saved together as one rule so the pair can never be applied half-updated.
 */
public record UpdateAccountLockoutRequest(
        @NotNull @Min(value = 3, message = "Lockout threshold must be at least 3 attempts")
        @Max(value = 10, message = "Lockout threshold cannot exceed 10 attempts") Integer attemptThreshold,

        @NotNull @Min(value = 1, message = "Lockout duration must be at least 1 minute")
        @Max(value = 1440, message = "Lockout duration cannot exceed 1440 minutes (24 hours)") Integer durationMinutes
) {}
