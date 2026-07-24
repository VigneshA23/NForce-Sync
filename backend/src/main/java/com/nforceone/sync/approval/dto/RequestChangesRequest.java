package com.nforceone.sync.approval.dto;

import jakarta.validation.constraints.NotBlank;

public record RequestChangesRequest(
        @NotBlank(message = "Comment is required when requesting changes")
        String comment
) {}
