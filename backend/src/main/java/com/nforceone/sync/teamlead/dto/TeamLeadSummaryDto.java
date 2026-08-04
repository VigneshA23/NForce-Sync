package com.nforceone.sync.teamlead.dto;

import java.math.BigDecimal;

public record TeamLeadSummaryDto(
        int        activeMembers,
        int        onLeaveCount,
        int        missingCount,          // excludes on-leave members
        int        pendingApprovalCount,
        int        submittedCount,
        BigDecimal avgUtilization,        // null = no approved EODs yet for the date
        int        underutilizedCount,
        int        overloadedCount,
        int        activeBlockersCount,
        ThresholdsDto thresholds,
        boolean    workingDay        // false on weekends/company holidays — avgUtilization/
                                      // underutilizedCount/overloadedCount carry no real signal
) {}
