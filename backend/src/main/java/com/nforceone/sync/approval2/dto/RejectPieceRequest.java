package com.nforceone.sync.approval2.dto;

import jakarta.validation.constraints.NotBlank;

public record RejectPieceRequest(
    @NotBlank(message = "Comment is required when rejecting")
    String comment
) {}
