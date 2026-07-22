package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.AppUser;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(

        @NotBlank(message = "Full name is required")
        String fullName,

        @NotBlank(message = "Email is required")
        @Email(message = "Must be a valid email address")
        @Pattern(regexp = "^[^@]+@nforceone\\.com$", message = "Email must end with @nforceone.com")
        String email,

        @NotBlank(message = "Password is required")
        @Size(min = 8, message = "Password must be at least 8 characters")
        String password,

        @NotNull(message = "Role is required")
        AppUser.Role role
) {}
