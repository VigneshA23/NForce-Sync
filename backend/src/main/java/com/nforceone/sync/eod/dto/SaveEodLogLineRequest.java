package com.nforceone.sync.eod.dto;

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

        Integer sortOrder
) {}
