package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * {@code client} carries no {@code @NotBlank} because it is only required when the chosen project
 * type has {@code requiresClient} set — a cross-field rule, enforced in ProjectService.
 * {@code endDate} stays optional: a null end date means the project is ongoing.
 */
public record CreateProjectRequest(
        @NotBlank @Size(max = 50) String code,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 200) String client,
        @NotNull Long projectTypeId,
        @NotNull Long billingModelId,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        /** The project's Team Lead, who approves its EOD entries. Must be an active MANAGER. */
        @NotNull Long pmId,
        /** The overseeing PM — scopes their Approvals queue, dashboard and reports. Active PM only. */
        @NotNull Long projectManagerId
) {}
