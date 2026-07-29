package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record UpdateWorkingHoursRequest(
        @NotNull @DecimalMin(value = "0.0", inclusive = false, message = "Working hours must be greater than 0")
        @DecimalMax(value = "24.0", message = "Working hours cannot exceed 24") BigDecimal hoursPerDay
) {}
