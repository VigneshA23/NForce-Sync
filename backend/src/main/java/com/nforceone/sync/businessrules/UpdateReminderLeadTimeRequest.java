package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateReminderLeadTimeRequest(
        @NotNull @Min(value = 1, message = "Reminder lead time must be at least 1 minute")
        @Max(value = 720, message = "Reminder lead time cannot exceed 12 hours") Integer leadMinutes
) {}
