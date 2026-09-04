package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;

import java.math.BigDecimal;

public record EodTaskDto(
        Long              id,
        Long              projectId,
        String            projectCode,
        Long              taskCategoryId,
        String            categoryName,
        String            description,
        BigDecimal        hours,
        EodTask.TaskStatus taskStatus,
        String            blockerReason,
        String            supportNeeded
) {
    public static EodTaskDto from(EodTask t) {
        return new EodTaskDto(
                t.getId(),
                t.getProject()      != null ? t.getProject().getId()      : null,
                t.getProject()      != null ? t.getProject().getCode()     : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getId()  : null,
                t.getTaskCategory() != null ? t.getTaskCategory().getName(): null,
                t.getDescription(),
                t.getHours(),
                t.getTaskStatus(),
                t.getBlockerReason(),
                t.getSupportNeeded()
        );
    }
}
