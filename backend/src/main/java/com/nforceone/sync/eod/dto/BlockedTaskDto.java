package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record BlockedTaskDto(
        Long           taskId,
        Long           entryId,
        Long           employeeId,
        String         employeeName,
        Long           employeeCode,
        LocalDate      entryDate,
        String         projectCode,
        String         projectName,
        String         categoryName,
        String         description,
        BigDecimal     hours,
        String         blockerReason,
        String         supportNeeded,
        OffsetDateTime submittedAt
) {
    public static BlockedTaskDto from(EodTask t) {
        var entry = t.getEodEntry();
        var emp   = entry.getEmployee();
        return new BlockedTaskDto(
                t.getId(),
                entry.getId(),
                emp.getId(),
                emp.getFullName(),
                emp.getEmployeeCode(),
                entry.getEntryDate(),
                t.getProject()      != null ? t.getProject().getCode()          : null,
                t.getProject()      != null ? t.getProject().getName()           : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getName()      : null,
                t.getDescription(),
                t.getHours(),
                t.getBlockerReason(),
                t.getSupportNeeded(),
                entry.getSubmittedAt()
        );
    }
}
