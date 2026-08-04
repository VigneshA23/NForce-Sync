package com.nforceone.sync.projectdashboard.dto;

import java.math.BigDecimal;

public record BillableSplitDto(
        BigDecimal billableHours,
        BigDecimal nonBillableHours,
        BigDecimal billablePct,
        BigDecimal nonBillablePct
) {}
