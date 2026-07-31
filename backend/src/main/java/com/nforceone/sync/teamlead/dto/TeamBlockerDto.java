package com.nforceone.sync.teamlead.dto;

import com.nforceone.sync.eod.EodTask;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record TeamBlockerDto(
        Long           taskId,
        Long           entryId,
        Long           employeeId,
        String         employeeName,
        String         employeeCode,
        LocalDate      entryDate,
        String         projectCode,
        String         projectName,
        String         categoryName,
        String         description,
        BigDecimal     hours,
        String         blockerReason,
        String         supportNeeded,
        OffsetDateTime submittedAt,
        long           openHours,        // hours since submittedAt (0 if not yet submitted)
        boolean        acknowledged,
        OffsetDateTime acknowledgedAt,
        String         acknowledgedByName
) {
    public static TeamBlockerDto from(EodTask t) {
        var entry = t.getEodEntry();
        var emp   = entry.getEmployee();
        OffsetDateTime submittedAt = entry.getSubmittedAt();
        long openHours = submittedAt != null
                ? java.time.Duration.between(submittedAt, OffsetDateTime.now()).toHours()
                : 0;
        return new TeamBlockerDto(
                t.getId(),
                entry.getId(),
                emp.getId(),
                emp.getFullName(),
                emp.getEmployeeCode(),
                entry.getEntryDate(),
                t.getProject()      != null ? t.getProject().getCode()     : null,
                t.getProject()      != null ? t.getProject().getName()      : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getName() : null,
                t.getDescription(),
                t.getHours(),
                t.getBlockerReason(),
                t.getSupportNeeded(),
                submittedAt,
                openHours,
                t.getAcknowledgedAt() != null,
                t.getAcknowledgedAt(),
                t.getAcknowledgedBy() != null ? t.getAcknowledgedBy().getFullName() : null
        );
    }
}
