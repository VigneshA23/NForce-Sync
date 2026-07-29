package com.nforceone.sync.auth.dto;

import com.nforceone.sync.auth.AppUser;

import java.time.LocalDate;

public record UserDto(
        Long   id,
        String fullName,
        String email,
        String role,
        String   employeeCode,
        String status,
        Long   managerId,
        // Org fields
        Long   departmentId,
        Long   designationId,
        Long   locationId,
        // Employee profile fields
        String employmentType,
        String workMode,
        LocalDate joiningDate,
        // Carried on the DTO so GET /api/auth/me stays authoritative: without it the
        // client rebuilds its session on refresh with the flag lost, skips the
        // force-change-password redirect, and then gets 403'd by JwtFilter on every call.
        boolean mustChangePassword
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
                user.getJoiningDate(),
                user.isMustChangePassword()
        );
    }
}
