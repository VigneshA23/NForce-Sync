package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalTime;

public record UpdateShiftRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull LocalTime startTime,
        @NotNull LocalTime endTime
) {}
