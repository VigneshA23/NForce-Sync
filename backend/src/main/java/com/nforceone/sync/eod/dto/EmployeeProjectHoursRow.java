package com.nforceone.sync.eod.dto;

import java.math.BigDecimal;

/** JPQL constructor-expression projection: approved hours summed per employee+project pair. */
public record EmployeeProjectHoursRow(Long employeeId, Long projectId, BigDecimal hours) {}
