package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code status} is optional and defaults to ACTIVE in the service — mirrors how
 * CreateProjectRequest always starts a project ACTIVE regardless of what is posted.
 *
 * <p>{@code projectId} is optional: a category is generic master data owned by the creating
 * Team Lead, not a required sub-resource of a project. When present, the service still checks
 * it names a project assigned to the acting Team Lead.
 */
public record CreateProjectCategoryRequest(
        Long projectId,
        @NotBlank @Size(max = 150) String name,
        @Size(max = 50) String code,
        @Size(max = 500) String description,
        @Size(max = 20) String color,
        String status
) {}
