package com.nforceone.sync.approval2.dto;

import com.nforceone.sync.approval2.EodProjectApproval;

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
    java.time.LocalDate entryDate
) {
    public static ApprovalPieceDto from(EodProjectApproval p) {
        return new ApprovalPieceDto(
                p.getId(),
                p.getEodEntry().getId(),
                p.getEodEntry().getEmployee().getId(),
                p.getEodEntry().getEmployee().getFullName(),
                p.getEodEntry().getEmployee().getEmployeeCode(),
                p.getProject() != null ? p.getProject().getId() : null,
                p.getProject() != null ? p.getProject().getName() : null,
                p.getApprover() != null ? p.getApprover().getId() : null,
                p.getApprover() != null ? p.getApprover().getFullName() : null,
                p.getApproverType().name(),
                p.getStatus().name(),
                p.getFrozenAt(),
                p.getActedAt(),
                p.getComment(),
                p.getEodEntry().getEntryDate()
        );
    }
}
