package com.nforceone.sync.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        // Not @NotBlank: omitted/blank for the forced-password-change flow, where the JWT's
        // mustChangePassword claim already proves the caller authenticated with the temporary
        // password moments ago. Required (checked in the controller) for a voluntary change.
        String currentPassword,

        @NotBlank
        @Size(min = 8)
        @Pattern(
                regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z\\d]).{8,}$",
                message = "Password must have uppercase, lowercase, digit, and symbol"
        )
        String newPassword
) {}
