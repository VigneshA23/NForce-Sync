package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** See CreateProjectRequest for why {@code client} is not @NotBlank and {@code endDate} is optional. */
public record UpdateProjectRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 200) String client,
        @NotBlank @Size(max = 50) String projectType,
        @Size(max = 50) String billingModel,
        @NotBlank String status,
        @NotNull LocalDate startDate,
        LocalDate endDate
) {}
