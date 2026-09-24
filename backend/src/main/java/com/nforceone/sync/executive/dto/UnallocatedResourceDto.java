package com.nforceone.sync.executive.dto;

public record UnallocatedResourceDto(
        Long employeeId,
        String employeeName,
        String employeeCode,
        String role
) {}
