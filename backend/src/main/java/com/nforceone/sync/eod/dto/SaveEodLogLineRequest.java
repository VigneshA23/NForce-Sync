package com.nforceone.sync.eod.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
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

        @NotBlank(message = "Description is required for each line")
        @Size(min = 3, max = 4000, message = "Description must be 3–4000 characters")
        String description,

        Integer sortOrder
) {}
