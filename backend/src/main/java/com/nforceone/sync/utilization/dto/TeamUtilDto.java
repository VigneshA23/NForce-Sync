package com.nforceone.sync.utilization.dto;

public record TeamUtilDto(
        Long            employeeId,
        String          employeeName,
        String            employeeCode,
        UtilSnapshotDto snapshot,
        /** Approved hours this member logged on projects the lead does NOT lead — an aggregate only, never
         *  names or task details. The percentages above are person-level (across all projects). */
        java.math.BigDecimal otherProjectsHours
) {}
