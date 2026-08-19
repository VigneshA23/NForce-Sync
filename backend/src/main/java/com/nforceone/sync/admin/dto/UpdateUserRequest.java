package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.AppUser;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record UpdateUserRequest(

        @NotBlank(message = "Full name is required")
        // Same rule as CreateUserRequest — see the note there.
        @Pattern(regexp = "^[\\p{L} ]+$",
                 message = "Full name may contain only letters and spaces")
        String fullName,

        @NotNull(message = "Role is required")
        AppUser.Role role,

        // Org assignments (null = leave unchanged / unassign)
        Long departmentId,
        Long designationId,
        Long locationId,
        Long shiftId,

        // Employee profile
        String employmentType,
        String workMode,

        Long managerId  // null = unassign
) {}
