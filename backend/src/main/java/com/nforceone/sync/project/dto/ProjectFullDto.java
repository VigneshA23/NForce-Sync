package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.Project;

import java.time.LocalDate;

public record ProjectFullDto(
        Long id,
        String code,
        String name,
        String client,
        /** Display name of the project type. */
        String projectType,
        /** Id of the same, so the edit form can preselect it. */
        Long projectTypeId,
        String status,
        /** The Team Lead who approves this project's EOD entries. */
        Long pmId,
        String pmName,
        /** The overseeing PM, whose Approvals queue and dashboard this project appears in. */
        Long projectManagerId,
        String projectManagerName,
        LocalDate startDate,
        LocalDate endDate,
        int allocatedHeadcount
) {
    public static ProjectFullDto from(Project p, int allocatedHeadcount) {
        return new ProjectFullDto(
                p.getId(),
                p.getCode(),
                p.getName(),
                p.getClient(),
                p.getProjectType() != null ? p.getProjectType().getName() : null,
                p.getProjectType() != null ? p.getProjectType().getId() : null,
                p.getStatus().name(),
                p.getPm() != null ? p.getPm().getId() : null,
                p.getPm() != null ? p.getPm().getFullName() : null,
                p.getProjectManager() != null ? p.getProjectManager().getId() : null,
                p.getProjectManager() != null ? p.getProjectManager().getFullName() : null,
                p.getStartDate(),
                p.getEndDate(),
                allocatedHeadcount);
    }
}
