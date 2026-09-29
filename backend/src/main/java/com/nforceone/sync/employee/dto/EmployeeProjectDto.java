package com.nforceone.sync.employee.dto;

import java.time.LocalDate;

public record EmployeeProjectDto(
        Long projectId,
        String projectCode,
        String projectName,
        String leadName,
        String projectStatus,
        LocalDate assignedFrom,
        LocalDate assignedTo
) {}
