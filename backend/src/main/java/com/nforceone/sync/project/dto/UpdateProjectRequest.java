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
        @NotNull Long billingModelId,
        @NotBlank String status,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        /**
         * The project's Team Lead. Must be an active MANAGER, except that the project's
         * existing owner may be re-sent unchanged — that is what lets legacy superadmin-owned
         * projects be edited without forcing a reassignment.
         */
        @NotNull Long pmId,
        /**
         * The overseeing PM. Must be an active PM, except that the project's current holder may be
         * re-sent unchanged, so an unrelated edit never forces oversight to move.
         */
        @NotNull Long projectManagerId
) {}
