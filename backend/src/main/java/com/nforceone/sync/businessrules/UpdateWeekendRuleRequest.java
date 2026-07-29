package com.nforceone.sync.businessrules;

import jakarta.validation.constraints.NotNull;

public record UpdateWeekendRuleRequest(
        @NotNull BusinessRuleConfig.WeekendRule weekendRule
) {}
