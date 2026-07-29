package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateEscalationSlaRequest(
        @NotNull @Min(value = 1, message = "Escalation SLA must be at least 1 hour")
        @Max(value = 168, message = "Escalation SLA cannot exceed 168 hours (1 week)") Integer slaHours
) {}
