package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * {@code client} carries no {@code @NotBlank} because it is only required when
 * {@code projectType} is CLIENT — a cross-field rule, enforced in ProjectService.
 * {@code endDate} stays optional: a null end date means the project is ongoing.
 */
public record CreateProjectRequest(
        @NotBlank @Size(max = 50) String code,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 200) String client,
        @NotBlank @Size(max = 50) String projectType,
        @Size(max = 50) String billingModel,
        @NotNull LocalDate startDate,
        LocalDate endDate
) {}
