package com.nforceone.sync.reports.dto;

import com.nforceone.sync.projectdashboard.dto.ProjectOptionDto;

import java.util.List;

public record TeamReportFiltersDto(
        List<ProjectOptionDto> projects,
        List<String> clients
) {}
