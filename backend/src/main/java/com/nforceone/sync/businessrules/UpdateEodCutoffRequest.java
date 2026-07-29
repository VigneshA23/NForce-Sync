package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.NotNull;

import java.time.LocalTime;

public record UpdateEodCutoffRequest(
        @NotNull LocalTime cutoffTime
) {}
