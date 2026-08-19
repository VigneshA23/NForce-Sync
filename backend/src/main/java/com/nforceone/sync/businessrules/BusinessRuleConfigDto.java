package com.nforceone.sync.businessrules;

import java.math.BigDecimal;

// eodCutoffTime is deliberately absent: the EOD deadline is per shift now
// (shift_definition.eod_cutoff_hours). The column still exists on business_rule_config but is no
// longer read or exposed.
public record BusinessRuleConfigDto(
        BigDecimal workingHoursPerDay,
        String weekendRule,
        Integer reminderLeadMinutes,
        Integer escalationSlaHours,
        Integer lockoutAttemptThreshold,
        Integer lockoutDurationMinutes,
        BigDecimal underutilizedThresholdPct,
        BigDecimal overloadedThresholdPct,
        BigDecimal atRiskMissingPct,
        BigDecimal blockerAgeAlertHours,
        /** Shared monthly pool of minutes across all three adjustment types (V62). */
        Integer monthlyAdjustmentMinutes
) {
    public static BusinessRuleConfigDto from(BusinessRuleConfig c) {
        return new BusinessRuleConfigDto(
                c.getWorkingHoursPerDay(),
                c.getWeekendRule().name(),
                c.getReminderLeadMinutes(),
                c.getEscalationSlaHours(),
                c.getLockoutAttemptThreshold(),
                c.getLockoutDurationMinutes(),
                c.getUnderutilizedThresholdPct(),
                c.getOverloadedThresholdPct(),
                c.getAtRiskMissingPct(),
                c.getBlockerAgeAlertHours(),
                c.getMonthlyAdjustmentMinutes()
        );
    }
}
