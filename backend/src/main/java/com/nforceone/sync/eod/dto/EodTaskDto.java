package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;
import com.nforceone.sync.project.dto.ProjectDto;

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
        Boolean           isBillable,
        String            blockerReason,
        String            supportNeeded,
        /** Whether this task's project allows a billable flag at all (ProjectDto.billableAllowed) —
         *  drives whether the Team Lead's per-task Billable checkbox is enabled or locked. */
        Boolean           billableAllowed,
        /** Whether a Team Lead has explicitly decided this task's billable status, as opposed to
         *  it merely carrying isBillable's default value. Drives the per-submission approval gate. */
        Boolean           billableDecided
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
                t.getIsBillable(),
                t.getBlockerReason(),
                t.getSupportNeeded(),
                t.getProject() != null && ProjectDto.billableAllowed(t.getProject()),
                t.getBillableDecided()
        );
    }
}
