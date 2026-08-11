package com.nforceone.sync.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Categories are team-level and generic — editing intentionally exposes only the fields the
 * "Existing Categories" table shows (name, description, status). Project/code/color/team
 * ownership are not editable here; see TeamLeadProjectService.updateCategory.
 */
public record UpdateProjectCategoryRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 500) String description,
        String status
) {}
