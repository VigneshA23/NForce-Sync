package com.nforceone.sync.businessrules;

import java.math.BigDecimal;

// eodCutoffTime and reminderLeadMinutes are deliberately absent: the EOD deadline is per shift now
// (shift_definition.eod_cutoff_hours). Both columns still exist on business_rule_config but are no
// longer read or exposed. reminderLeadMinutes meant "remind N minutes before the global cutoff",
// which has nothing to hang off once the deadline became per shift — EodReminderScheduler fires off
// ShiftSchedule.cutoffAt and never consulted it.
public record BusinessRuleConfigDto(
        BigDecimal workingHoursPerDay,
        String weekendRule,
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
