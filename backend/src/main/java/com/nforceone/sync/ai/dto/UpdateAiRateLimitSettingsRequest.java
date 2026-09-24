package com.nforceone.sync.ai.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateAiRateLimitSettingsRequest(
        @NotNull Boolean enabled,
        @NotNull @Min(1) @Max(1000) Integer requestsPerWindow,
        @NotNull @Min(1) @Max(1440) Integer windowMinutes
) {
}
