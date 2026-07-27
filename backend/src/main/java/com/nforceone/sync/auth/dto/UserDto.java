package com.nforceone.sync.auth.dto;

import com.nforceone.sync.auth.AppUser;

import java.time.LocalDate;

public record UserDto(
        Long   id,
        String fullName,
        String email,
        String role,
        Long   employeeCode,
        String status,
        Long   managerId,
        // Org fields
        Long   departmentId,
        Long   designationId,
        Long   locationId,
        // Employee profile fields
        String employmentType,
        String workMode,
        LocalDate joiningDate
) {
    public static UserDto from(AppUser user) {
        return new UserDto(
                user.getId(),
                user.getFullName(),
                user.getEmail(),
                user.getRole().name(),
                user.getEmployeeCode(),
                user.getStatus().name(),
                user.getManager() != null ? user.getManager().getId() : null,
                user.getDepartmentId(),
                user.getDesignationId(),
                user.getLocationId(),
                user.getEmploymentType(),
                user.getWorkMode(),
                user.getJoiningDate()
        );
    }
}
