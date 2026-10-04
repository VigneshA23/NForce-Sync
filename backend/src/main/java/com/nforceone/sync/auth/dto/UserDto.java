package com.nforceone.sync.auth.dto;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;

import java.time.LocalDate;
import java.util.List;

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
        Long   shiftId,
        // Employee profile fields
        String employmentType,
        String workMode,
        LocalDate joiningDate,
        // Carried on the DTO so GET /api/auth/me stays authoritative: without it the
        // client rebuilds its session on refresh with the flag lost, skips the
        // force-change-password redirect, and then gets 403'd by JwtFilter on every call.
        boolean mustChangePassword,
        Capabilities capabilities
) {
    public record Capabilities(
            List<Long>   leadsProjectIds,
            List<String> leadsProjectNames,
            List<Long>   managesProjectIds,
            List<String> managesProjectNames,
            boolean      hasDirectReports
    ) {
        static Capabilities empty() {
            return new Capabilities(List.of(), List.of(), List.of(), List.of(), false);
        }

        static Capabilities from(List<Project> led, List<Project> managed, boolean hasDirectReports) {
            return new Capabilities(
                    led.stream().map(Project::getId).toList(),
                    led.stream().map(Project::getName).toList(),
                    managed.stream().map(Project::getId).toList(),
                    managed.stream().map(Project::getName).toList(),
                    hasDirectReports
            );
        }
    }

    public static UserDto from(AppUser user) {
        return from(user, List.of(), List.of(), false);
    }

    public static UserDto from(AppUser user, List<Project> led, List<Project> managed, boolean hasDirectReports) {
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
                user.getShiftId(),
                user.getEmploymentType(),
                user.getWorkMode(),
                user.getJoiningDate(),
                user.isMustChangePassword(),
                Capabilities.from(led, managed, hasDirectReports)
        );
    }
}
