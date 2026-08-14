package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** JPQL constructor-expression projection: approved hours summed per entry date and billable flag. */
public record DateBillableHoursRow(LocalDate date, boolean billable, BigDecimal hours) {}
