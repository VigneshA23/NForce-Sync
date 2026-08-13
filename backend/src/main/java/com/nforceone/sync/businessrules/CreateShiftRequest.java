package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalTime;

public record CreateShiftRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull LocalTime startTime,
        @NotNull LocalTime endTime,
        /** Optional — null leaves the shift with no EOD deadline and no reminder. */
        @DecimalMin("0") @DecimalMax("24") BigDecimal eodCutoffHours
) {}
