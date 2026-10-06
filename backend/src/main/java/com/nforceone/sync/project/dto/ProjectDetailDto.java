package com.nforceone.sync.project.dto;

import com.nforceone.sync.project.Project;

import java.time.LocalDate;
import java.util.List;

/** Project details plus its currently assigned employees, for the Team Lead project details popup. */
public record ProjectDetailDto(
        Long id,
        String code,
        String name,
        String client,
        String status,
        Long leadId,
        String leadName,
        LocalDate startDate,
        LocalDate endDate,
        List<EmployeeRefDto> employees
) {
    public static ProjectDetailDto from(Project p, List<EmployeeRefDto> employees) {
        return new ProjectDetailDto(
                p.getId(),
                p.getCode(),
                p.getName(),
                p.getClient(),
                p.getStatus().name(),
                p.getLead() != null ? p.getLead().getId() : null,
                p.getLead() != null ? p.getLead().getFullName() : null,
                p.getStartDate(),
                p.getEndDate(),
                employees);
    }
}
