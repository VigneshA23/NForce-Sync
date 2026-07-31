package com.nforceone.sync.teamlead.dto;

import java.math.BigDecimal;

// Read-only view of the relevant slice of the Admin Config (business_rule_config) for
// Team Leads, who aren't SUPERADMIN and can't call /api/admin/business-rules/config directly.
public record ThresholdsDto(
        BigDecimal underutilizedPct,
        BigDecimal overloadedPct,
        BigDecimal atRiskMissingPct,
        BigDecimal blockerAgeAlertHours
) {}
