package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Every field on the Notifications &amp; Escalation card, saved as one rule.
 *
 * <p>Deliberately not one endpoint per field: {@code business_rule_config} is a single row, and each
 * update writes the whole row from its own snapshot. Firing several single-field requests for one
 * Save click meant the last transaction to commit silently reverted the others, so a change appeared
 * not to save until it was clicked again.
 */
public record UpdateNotificationsRequest(
        @NotNull @Min(value = 1, message = "Escalation SLA must be at least 1 hour")
        @Max(value = 168, message = "Escalation SLA cannot exceed 168 hours (1 week)") Integer escalationSlaHours,

        @NotNull @Min(value = 3, message = "Lockout threshold must be at least 3 attempts")
        @Max(value = 10, message = "Lockout threshold cannot exceed 10 attempts") Integer lockoutAttemptThreshold,

        @NotNull @Min(value = 1, message = "Lockout duration must be at least 1 minute")
        @Max(value = 1440, message = "Lockout duration cannot exceed 1440 minutes (24 hours)") Integer lockoutDurationMinutes
) {}
