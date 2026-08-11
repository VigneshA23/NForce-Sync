package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** See CreateProjectRequest for why {@code client} is not @NotBlank and {@code endDate} is optional. */
public record UpdateProjectRequest(
        /** Editable, but still unique across projects. Nothing looks a project up by code. */
        @NotBlank @Size(max = 50) String code,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 200) String client,
        @NotNull Long projectTypeId,
        Long billingModelId,
        @NotBlank String status,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        /**
         * The project's TL. Must be an active MANAGER (Team Lead) or PM, except that the project's
         * existing owner may be re-sent unchanged — that is what lets legacy superadmin-owned
         * projects be edited without forcing a reassignment.
         */
        @NotNull Long pmId
) {}
