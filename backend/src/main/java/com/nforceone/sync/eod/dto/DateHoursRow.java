package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** JPQL constructor-expression projection: approved hours summed per day. */
public record DateHoursRow(LocalDate date, BigDecimal hours) {}
