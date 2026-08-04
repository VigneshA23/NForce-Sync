package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;

/** JPQL constructor-expression projection: approved hours summed per project. */
public record ProjectHoursRow(Long projectId, BigDecimal hours) {}
