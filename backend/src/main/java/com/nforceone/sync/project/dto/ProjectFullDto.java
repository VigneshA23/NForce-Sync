package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.Project;

import java.time.LocalDate;

public record ProjectFullDto(
        Long id,
        String code,
        String name,
        String client,
        String projectType,
        String billingModel,
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
                p.getProjectType(),
                p.getBillingModel(),
                p.getStatus().name(),
                p.getPm() != null ? p.getPm().getId() : null,
                p.getPm() != null ? p.getPm().getFullName() : null,
                p.getStartDate(),
                p.getEndDate(),
                allocatedHeadcount);
    }
}
