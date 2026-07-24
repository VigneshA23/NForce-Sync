package com.nforceone.sync.approval.dto;

import jakarta.validation.constraints.NotBlank;

public record RejectRequest(
        @NotBlank(message = "Comment is required when rejecting")
        String comment
) {}
