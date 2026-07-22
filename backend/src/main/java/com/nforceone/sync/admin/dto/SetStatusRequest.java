package com.nforceone.sync.admin.dto;

import com.nforceone.sync.auth.AppUser;
import jakarta.validation.constraints.NotNull;

public record SetStatusRequest(
        @NotNull(message = "Status is required")
        AppUser.Status status
) {}
