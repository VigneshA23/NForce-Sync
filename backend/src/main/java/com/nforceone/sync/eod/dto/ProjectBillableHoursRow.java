package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;

/** JPQL constructor-expression projection: approved hours summed per project and billable flag. */
public record ProjectBillableHoursRow(Long projectId, boolean billable, BigDecimal hours) {}
