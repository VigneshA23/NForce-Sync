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
        /** Display name of the billing model; null when unset. */
        String billingModel,
        /** Id of the same, so the edit form can preselect it. */
        Long billingModelId,
        String status,
        Long pmId,
        String pmName,
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
                p.getBillingModel() != null ? p.getBillingModel().getName() : null,
                p.getBillingModel() != null ? p.getBillingModel().getId() : null,
                p.getStatus().name(),
                p.getPm() != null ? p.getPm().getId() : null,
                p.getPm() != null ? p.getPm().getFullName() : null,
                p.getStartDate(),
                p.getEndDate(),
                allocatedHeadcount);
    }
}
