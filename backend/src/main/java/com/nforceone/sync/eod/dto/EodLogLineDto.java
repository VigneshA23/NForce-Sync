package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodLogLine;

import java.math.BigDecimal;

public record EodLogLineDto(
        Long id,
        Long categoryId,
        String categoryName,
        BigDecimal hours,
        String description,
        Integer sortOrder,
        /** COMPLETED / IN_PROGRESS / BLOCKED / NOT_STARTED, or null on a draft line with none chosen and on lines from before V118. */
        String taskStatus,
        /** Why it is blocked; set only while the status is BLOCKED. */
        String blockerReason,
        /** True when this line's blocker already has a conversation — the line then cannot be removed (the form
         *  disables Remove and says why). Only filled in where the owner's own entry is loaded; false elsewhere. */
        boolean hasBlockerThread
) {
    /** A line with no blocker thread — the common case, and how callers that predate the flag build one. */
    public EodLogLineDto(Long id, Long categoryId, String categoryName, BigDecimal hours, String description,
                         Integer sortOrder, String taskStatus, String blockerReason) {
        this(id, categoryId, categoryName, hours, description, sortOrder, taskStatus, blockerReason, false);
    }

    /** A line with no status — used where only the line's content matters. */
    public EodLogLineDto(Long id, Long categoryId, String categoryName, BigDecimal hours, String description,
                         Integer sortOrder) {
        this(id, categoryId, categoryName, hours, description, sortOrder, null, null, false);
    }

    public EodLogLineDto withBlockerThread(boolean value) {
        return new EodLogLineDto(id, categoryId, categoryName, hours, description, sortOrder, taskStatus,
                blockerReason, value);
    }

    public static EodLogLineDto from(EodLogLine line) {
        return new EodLogLineDto(
                line.getId(),
                line.getCategory().getId(),
                line.getCategory().getName(),
                line.getHours(),
                line.getDescription(),
                line.getSortOrder(),
                line.getTaskStatus() != null ? line.getTaskStatus().name() : null,
                line.getBlockerReason()
        );
    }
}
