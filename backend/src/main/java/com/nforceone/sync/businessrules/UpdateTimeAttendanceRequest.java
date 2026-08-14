package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/**
 * Both fields on the Time &amp; Attendance card, saved as one rule — same reasoning as
 * {@link UpdateNotificationsRequest}: separate per-field requests for a single Save click raced each
 * other on the one config row and lost updates.
 */
public record UpdateTimeAttendanceRequest(
        @NotNull @DecimalMin(value = "1.0", message = "Working hours must be at least 1")
        @DecimalMax(value = "24.0", message = "Working hours cannot exceed 24") BigDecimal hoursPerDay,

        @NotBlank(message = "Weekend rule is required") String weekendRule
) {}
