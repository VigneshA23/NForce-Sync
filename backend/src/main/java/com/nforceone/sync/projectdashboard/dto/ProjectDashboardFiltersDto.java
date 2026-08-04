package com.nforceone.sync.projectdashboard.dto;

import java.util.List;

public record ProjectDashboardFiltersDto(
        List<ProjectOptionDto> projects,
        List<EmployeeOptionDto> employees,
        List<TeamOptionDto> teams,
        List<String> clients
) {}
