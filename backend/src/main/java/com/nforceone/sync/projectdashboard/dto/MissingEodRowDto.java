package com.nforceone.sync.projectdashboard.dto;

import java.time.LocalDate;

public record MissingEodRowDto(
        Long employeeId,
        String employeeName,
        String projectName,
        String teamName,
        LocalDate date,
        int daysMissing,
        String status
) {}
