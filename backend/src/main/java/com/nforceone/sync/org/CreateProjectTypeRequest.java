package com.nforceone.sync.org;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The flag is set at creation; it decides behaviour, so it is not editable by rename. */
public record CreateProjectTypeRequest(
        @NotBlank @Size(max = 200) String name,
        boolean requiresClient
) {}
