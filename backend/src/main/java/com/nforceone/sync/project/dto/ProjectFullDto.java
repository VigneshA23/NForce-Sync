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
        Long leadId,
        String leadName,
        /** The overseeing PM, whose Approvals queue and dashboard this project appears in. */
        Long pmId,
        String pmName,
        LocalDate startDate,
        LocalDate endDate,
        int allocatedHeadcount
) {
    /** Same project, but with the given dates — e.g. an Employee's allocation window instead of the project's own. */
    public ProjectFullDto withDates(LocalDate newStartDate, LocalDate newEndDate) {
        return new ProjectFullDto(id, code, name, client, projectType, projectTypeId, status,
                leadId, leadName, pmId, pmName, newStartDate, newEndDate, allocatedHeadcount);
    }

    public static ProjectFullDto from(Project p, int allocatedHeadcount) {
        return new ProjectFullDto(
                p.getId(),
                p.getCode(),
                p.getName(),
                p.getClient(),
                p.getProjectType() != null ? p.getProjectType().getName() : null,
                p.getProjectType() != null ? p.getProjectType().getId() : null,
                p.getStatus().name(),
                p.getLead() != null ? p.getLead().getId() : null,
                p.getLead() != null ? p.getLead().getFullName() : null,
                p.getPm() != null ? p.getPm().getId() : null,
                p.getPm() != null ? p.getPm().getFullName() : null,
                p.getStartDate(),
                p.getEndDate(),
                allocatedHeadcount);
    }
}
