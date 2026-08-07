package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.ProjectCategory;

import java.time.OffsetDateTime;

public record ProjectCategoryDto(
        Long id,
        Long projectId,
        String projectName,
        String name,
        String code,
        String description,
        String color,
        String status,
        Long createdById,
        String createdByName,
        OffsetDateTime createdAt
) {
    public static ProjectCategoryDto from(ProjectCategory c) {
        return new ProjectCategoryDto(
                c.getId(),
                c.getProject() != null ? c.getProject().getId() : null,
                c.getProject() != null ? c.getProject().getName() : null,
                c.getName(),
                c.getCode(),
                c.getDescription(),
                c.getColor(),
                c.getStatus().name(),
                c.getCreatedBy() != null ? c.getCreatedBy().getId() : null,
                c.getCreatedBy() != null ? c.getCreatedBy().getFullName() : null,
                c.getCreatedAt());
    }
}
