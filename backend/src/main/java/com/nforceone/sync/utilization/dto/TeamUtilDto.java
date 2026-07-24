package com.nforceone.sync.utilization.dto;

public record TeamUtilDto(
        Long            employeeId,
        String          employeeName,
        Long            employeeCode,
        UtilSnapshotDto snapshot
) {}
