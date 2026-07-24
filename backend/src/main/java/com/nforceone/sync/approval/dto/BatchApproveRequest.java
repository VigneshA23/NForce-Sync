package com.nforceone.sync.approval.dto;

import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record BatchApproveRequest(
        @NotEmpty(message = "At least one entry ID is required")
        List<Long> entryIds
) {}
