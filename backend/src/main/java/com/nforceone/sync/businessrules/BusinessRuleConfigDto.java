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
        BigDecimal underutilizedThresholdPct,
        BigDecimal overloadedThresholdPct,
        BigDecimal atRiskMissingPct,
        BigDecimal blockerAgeAlertHours,
        Integer lateArrivalAllowance,
        Integer earlyLeaveAllowance,
        Integer interveningAllowance
) {
    public static BusinessRuleConfigDto from(BusinessRuleConfig c) {
        return new BusinessRuleConfigDto(
                c.getWorkingHoursPerDay(),
                c.getWeekendRule().name(),
                c.getReminderLeadMinutes(),
                c.getEscalationSlaHours(),
                c.getUnderutilizedThresholdPct(),
                c.getOverloadedThresholdPct(),
                c.getAtRiskMissingPct(),
                c.getBlockerAgeAlertHours(),
                c.getLateArrivalAllowance(),
                c.getEarlyLeaveAllowance(),
                c.getInterveningAllowance()
        );
    }
}
