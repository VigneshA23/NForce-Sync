package com.nforceone.sync.org;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The two flags are set at creation; they decide behaviour, so they are not editable by rename. */
public record CreateProjectTypeRequest(
        @NotBlank @Size(max = 200) String name,
        boolean requiresClient,
        boolean billableAllowed
) {}
