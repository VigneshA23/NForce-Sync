package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodTask;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record SaveEodLogLineRequest(
        @NotNull(message = "Category is required for each line")
        Long categoryId,

        @NotNull(message = "Hours are required for each line")
        @DecimalMin(value = "0.25", message = "Each line must have at least 0.25 hours")
        @DecimalMax(value = "24.00", message = "Hours per line cannot exceed 24")
        BigDecimal hours,

        // Drafts may carry an empty or short description (autosave must not lose a half-typed row).
        // "Required" and the 3-character minimum are enforced where it matters — on submit, by
        // PlainLogValidation — so only the upper bound is checked here.
        @Size(max = 4000, message = "Description must be 4000 characters or fewer")
        String description,

        Integer sortOrder,

        /** The id of the saved line this row came from, when the client has it. Lets a re-save keep the same row —
         *  and so the blocker thread, read state and Acknowledge/Resolve markers attached to it — instead of
         *  deleting and recreating it. Null for a row added since the entry was loaded. */
        Long id,

        // Same four values as a Submit EOD task. Drafts may leave it empty; every line needs one on SUBMIT
        // (PlainLogValidation). An unknown value is rejected while the request is read.
        EodTask.TaskStatus taskStatus,

        /** Same cap as a Submit EOD task's blocker reason. Required on submit when the status is BLOCKED. */
        @Size(max = 300, message = "Blocker reason must be 300 characters or fewer")
        String blockerReason
) {
    /** A line with no id, status or blocker reason — how callers that predate V118 build one. */
    public SaveEodLogLineRequest(Long categoryId, BigDecimal hours, String description, Integer sortOrder) {
        this(categoryId, hours, description, sortOrder, null, null, null);
    }
}
