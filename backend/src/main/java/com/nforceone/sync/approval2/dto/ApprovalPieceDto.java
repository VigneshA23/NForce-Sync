package com.nforceone.sync.approval2.dto;

import com.nforceone.sync.approval2.EodProjectApproval;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.eod.dto.EodLogLineDto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

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
    String logNotes,
    // V110+ line items — empty for legacy PLAIN_LOG entries
    List<EodLogLineDto> logLines,
    // Escalation fields — null when piece has not been escalated
    OffsetDateTime escalatedAt,
    Long escalatedToId,
    String escalatedToName,
    Double hoursPending,
    // Day-type metadata for PLAIN_LOG pieces — null for PROJECT_GROUPED
    String dayType,
    String workLocation,
    String nextDayPlan,
    String remarks,
    // Task lines for PROJECT_GROUPED pieces — empty for PLAIN_LOG
    List<TaskLineDto> taskLines
) {
    public record TaskLineDto(String projectCode, String projectName, String categoryName, BigDecimal hours, String description) {}

    public static ApprovalPieceDto from(EodProjectApproval p) {
        return from(p, List.of(), List.of());
    }

    public static ApprovalPieceDto from(EodProjectApproval p, List<EodLogLineDto> logLines) {
        return from(p, logLines, List.of());
    }

    public static ApprovalPieceDto from(EodProjectApproval p, List<EodLogLineDto> logLines,
                                        List<TaskLineDto> taskLines) {
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
                isPlainLog ? entry.getLogNotes() : null,
                isPlainLog ? logLines : List.of(),
                p.getEscalatedAt(),
                p.getEscalatedTo() != null ? p.getEscalatedTo().getId() : null,
                p.getEscalatedTo() != null ? p.getEscalatedTo().getFullName() : null,
                p.getFrozenAt() != null
                        ? (double) java.time.Duration.between(p.getFrozenAt(), java.time.OffsetDateTime.now()).toMinutes() / 60.0
                        : null,
                isPlainLog && entry.getDayType() != null ? entry.getDayType().name() : null,
                isPlainLog ? entry.getWorkLocation() : null,
                isPlainLog ? entry.getNextDayPlan() : null,
                isPlainLog ? entry.getRemarks() : null,
                isPlainLog ? List.of() : taskLines
        );
    }

    /** Convenience factory: builds TaskLineDto list from raw EodTask list scoped to one project. */
    public static List<TaskLineDto> taskLinesFor(List<EodTask> tasks, Long projectId) {
        return tasks.stream()
                .filter(t -> t.getProject() != null && t.getProject().getId().equals(projectId))
                .map(t -> new TaskLineDto(
                        t.getProject().getCode(),
                        t.getProject().getName(),
                        t.getTaskCategory() != null ? t.getTaskCategory().getName() : null,
                        t.getHours(),
                        t.getDescription()))
                .toList();
    }
}
