package com.nforceone.sync.businessrules;

import java.math.BigDecimal;
import java.time.LocalTime;

public record BusinessRuleConfigDto(
        BigDecimal workingHoursPerDay,
        String weekendRule,
        LocalTime eodCutoffTime,
        Integer reminderLeadMinutes,
        Integer escalationSlaHours,
        BigDecimal underutilizedThresholdPct,
        BigDecimal overloadedThresholdPct,
        BigDecimal atRiskMissingPct,
        BigDecimal blockerAgeAlertHours
) {
    public static BusinessRuleConfigDto from(BusinessRuleConfig c) {
        return new BusinessRuleConfigDto(
                c.getWorkingHoursPerDay(),
                c.getWeekendRule().name(),
                c.getEodCutoffTime(),
                c.getReminderLeadMinutes(),
                c.getEscalationSlaHours(),
                c.getUnderutilizedThresholdPct(),
                c.getOverloadedThresholdPct(),
                c.getAtRiskMissingPct(),
                c.getBlockerAgeAlertHours()
        );
    }
}
