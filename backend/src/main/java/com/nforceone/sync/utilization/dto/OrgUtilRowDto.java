package com.nforceone.sync.utilization.dto;

public record OrgUtilRowDto(
        Long            employeeId,
        String          employeeName,
        String          employeeCode,
        String          role,
        Long            departmentId,
        String          departmentName,
        UtilSnapshotDto snapshot
) {}
