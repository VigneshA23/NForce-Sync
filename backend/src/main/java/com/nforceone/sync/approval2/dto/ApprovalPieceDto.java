package com.nforceone.sync.approval2.dto;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.eod.EodEntry;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record ApprovalPieceDto(
    Long id,
    Long eodEntryId,
    Long employeeId,
    String employeeName,
    String employeeCode,
    Long projectId,
    String projectName,
    Long approverId,
    String approverName,
    String approverType,
    String status,
    OffsetDateTime frozenAt,
    OffsetDateTime actedAt,
    String comment,
    java.time.LocalDate entryDate,
    // PLAIN_LOG fields — null for PROJECT_GROUPED pieces
    String entryForm,
    String logSummary,
    BigDecimal logTotalHours,
    String logNotes
) {
    public static ApprovalPieceDto from(EodProjectApproval p) {
        EodEntry entry = p.getEodEntry();
        boolean isPlainLog = entry.getEntryForm() == EodEntry.EntryForm.PLAIN_LOG;
        return new ApprovalPieceDto(
                p.getId(),
                entry.getId(),
                entry.getEmployee().getId(),
                entry.getEmployee().getFullName(),
                entry.getEmployee().getEmployeeCode(),
                p.getProject() != null ? p.getProject().getId() : null,
                p.getProject() != null ? p.getProject().getName() : null,
                p.getApprover() != null ? p.getApprover().getId() : null,
                p.getApprover() != null ? p.getApprover().getFullName() : null,
                p.getApproverType().name(),
                p.getStatus().name(),
                p.getFrozenAt(),
                p.getActedAt(),
                p.getComment(),
                entry.getEntryDate(),
                entry.getEntryForm() != null ? entry.getEntryForm().name() : EodEntry.EntryForm.PROJECT_GROUPED.name(),
                isPlainLog ? entry.getLogSummary() : null,
                isPlainLog ? entry.getLogTotalHours() : null,
                isPlainLog ? entry.getLogNotes() : null
        );
    }
}
