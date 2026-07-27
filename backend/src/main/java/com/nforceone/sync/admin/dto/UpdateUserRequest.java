package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.AppUser;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UpdateUserRequest(

        @NotBlank(message = "Full name is required")
        String fullName,

        @NotNull(message = "Role is required")
        AppUser.Role role,

        // Org assignments (null = leave unchanged / unassign)
        Long departmentId,
        Long designationId,
        Long locationId,

        // Employee profile
        String employmentType,
        String workMode,

        Long managerId  // null = unassign
) {}
