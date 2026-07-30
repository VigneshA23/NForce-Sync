package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.AppUser;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;

public record CreateUserRequest(

        @NotBlank(message = "Full name is required")
        String fullName,

        @NotBlank(message = "Email is required")
        @Email(message = "Must be a valid email address")
        @Pattern(regexp = "^[^@]+@nforceone\\.com$", message = "Email must end with @nforceone.com")
        String email,

        @NotNull(message = "Role is required")
        AppUser.Role role,

        @NotBlank(message = "Employee ID is required")
        @Pattern(regexp = "^NF-\\d{8}$", message = "Employee ID must match format NF-######## (e.g. NF-20240040)")
        String employeeCode,

        // Org assignments
        Long departmentId,
        Long designationId,
        Long locationId,
        Long shiftId,             // references shift_definition — managed centrally in Business Rules

        // Employee profile
        String employmentType,   // FULL_TIME | CONTRACT | INTERN | CONSULTANT (defaults to FULL_TIME)
        String workMode,         // ONSITE | OFFICE | HYBRID | REMOTE (defaults to ONSITE)
        LocalDate joiningDate,

        // Reporting line
        Long managerId           // null = no manager assigned
) {}
