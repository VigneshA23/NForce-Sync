package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;

/** JPQL constructor-expression projection: approved hours summed per task category name. */
public record CategoryHoursRow(String categoryName, BigDecimal hours) {}
