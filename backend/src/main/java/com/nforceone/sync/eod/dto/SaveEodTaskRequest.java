package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** Free-text fields are capped at 300 characters, matching MAX_TEXT_LEN on the Submit EOD form. */
public record SaveEodTaskRequest(
        Long              projectId,
        Long              taskCategoryId,
        @Size(max = 300)  String description,
        BigDecimal        hours,
        EodTask.TaskStatus taskStatus,
        Boolean           isBillable,
        @Size(max = 300)  String blockerReason,
        String            supportNeeded
) {}
