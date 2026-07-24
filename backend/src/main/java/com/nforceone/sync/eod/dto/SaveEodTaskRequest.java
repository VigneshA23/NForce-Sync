package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;

import java.math.BigDecimal;

public record SaveEodTaskRequest(
        Long              projectId,
        Long              taskCategoryId,
        String            description,
        BigDecimal        hours,
        EodTask.TaskStatus taskStatus,
        Boolean           isBillable,
        String            blockerReason,
        String            supportNeeded
) {}
