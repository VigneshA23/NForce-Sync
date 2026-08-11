package com.nforceone.sync.pmblockers.dto;

import com.nforceone.sync.projectdashboard.dto.ProjectOptionDto;
import com.nforceone.sync.projectdashboard.dto.TeamOptionDto;

import java.util.List;

public record PmBlockersFiltersDto(
        List<ProjectOptionDto> projects,
        List<TeamOptionDto> teams
) {}
