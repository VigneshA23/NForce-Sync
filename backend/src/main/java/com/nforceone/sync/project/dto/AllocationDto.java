package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.Allocation;

import java.time.LocalDate;

public record AllocationDto(
        Long id,
        Long employeeId,
        String employeeName,
        String employeeCode,
        Long projectId,
        String projectCode,
        String projectName,
        LocalDate effectiveFrom,
        LocalDate effectiveTo,
        Integer allocationPct
) {
    public static AllocationDto from(Allocation a) {
        return new AllocationDto(
                a.getId(),
                a.getEmployee().getId(),
                a.getEmployee().getFullName(),
                a.getEmployee().getEmployeeCode(),
                a.getProject().getId(),
                a.getProject().getCode(),
                a.getProject().getName(),
                a.getEffectiveFrom(),
                a.getEffectiveTo(),
                a.getAllocationPct());
    }
}
