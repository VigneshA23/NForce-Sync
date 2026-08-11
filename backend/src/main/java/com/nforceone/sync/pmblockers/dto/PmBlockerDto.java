package com.nforceone.sync.pmblockers.dto;

import com.nforceone.sync.eod.EodTask;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/** Read-only, cross-team view of a blocker for the Project Manager Blockers page — no
 *  reply-thread or status-change fields, since PMs cannot take part in the conversation. */
public record PmBlockerDto(
        Long           taskId,
        Long           employeeId,
        String         employeeName,
        String         employeeCode,
        String         teamName,       // the reporting employee's Team Lead (manager) full name
        String         projectCode,
        String         projectName,
        LocalDate      entryDate,
        String         categoryName,
        String         description,
        String         blockerReason,
        OffsetDateTime submittedAt,
        long           openHours,      // hours since submittedAt (0 if not yet submitted)
        String         status,         // "NEEDS_RESPONSE" | "ACKNOWLEDGED" | "RESOLVED"
        OffsetDateTime resolvedAt
) {
    public static PmBlockerDto from(EodTask t) {
        var entry = t.getEodEntry();
        var emp = entry.getEmployee();
        OffsetDateTime submittedAt = entry.getSubmittedAt();
        long openHours = submittedAt != null
                ? java.time.Duration.between(submittedAt, OffsetDateTime.now()).toHours()
                : 0;

        return new PmBlockerDto(
                t.getId(),
                emp.getId(),
                emp.getFullName(),
                emp.getEmployeeCode(),
                emp.getManager() != null ? emp.getManager().getFullName() : "-",
                t.getProject()      != null ? t.getProject().getCode()      : null,
                t.getProject()      != null ? t.getProject().getName()      : null,
                entry.getEntryDate(),
                t.getTaskCategory() != null ? t.getTaskCategory().getName() : null,
                t.getDescription(),
                t.getBlockerReason(),
                submittedAt,
                openHours,
                t.getBlockerStatus(),
                t.getResolvedAt()
        );
    }
}
