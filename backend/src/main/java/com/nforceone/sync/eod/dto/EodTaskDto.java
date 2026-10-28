package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;

import java.math.BigDecimal;
import java.util.List;

public record EodTaskDto(
        Long              id,
        Long              projectId,
        String            projectCode,
        String            projectName,
        Long              taskCategoryId,
        String            categoryName,
        String            description,
        BigDecimal        hours,
        EodTask.TaskStatus taskStatus,
        String            blockerReason,
        String            supportNeeded,
        List<EodAttachmentDto> attachments
) {
    /** No attachments — used wherever the caller hasn't batch-fetched them (e.g. call sites not
     *  yet updated to pass a lookup). Prefer {@link #from(EodTask, List)} when they're available. */
    public static EodTaskDto from(EodTask t) {
        return from(t, List.of());
    }

    public static EodTaskDto from(EodTask t, List<EodAttachmentDto> attachments) {
        return new EodTaskDto(
                t.getId(),
                t.getProject()      != null ? t.getProject().getId()      : null,
                t.getProject()      != null ? t.getProject().getCode()     : null,
                t.getProject()      != null ? t.getProject().getName()     : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getId()  : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getName(): null,
                t.getDescription(),
                t.getHours(),
                t.getTaskStatus(),
                t.getBlockerReason(),
                t.getSupportNeeded(),
                attachments != null ? attachments : List.of()
        );
    }
}
