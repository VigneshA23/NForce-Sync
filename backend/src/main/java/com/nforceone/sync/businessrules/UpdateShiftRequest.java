package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalTime;

public record UpdateShiftRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull LocalTime startTime,
        @NotNull LocalTime endTime,
        /** Optional — null clears any existing cutoff, disabling the reminder for this shift. */
        @DecimalMin("0") @DecimalMax("24") BigDecimal eodCutoffHours
) {}
