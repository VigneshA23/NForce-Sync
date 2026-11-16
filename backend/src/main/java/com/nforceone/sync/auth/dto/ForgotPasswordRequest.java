package com.nforceone.sync.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The address must have a dotted domain (a@b is rejected, which @Email alone accepts). The same
 * shape is checked in the browser (lib/emailFormat.ts) — keep the two in step.
 */
public record ForgotPasswordRequest(
        @NotBlank
        @Size(max = 200)
        @Email
        @Pattern(regexp = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "must be a valid email address")
        String email) {}
