package com.nforceone.sync.eod.dto;

import jakarta.validation.constraints.NotBlank;

/** Body for opening a clarification round or posting a reply into one — same shape either way. */
public record EodClarificationMessageRequest(
        @NotBlank(message = "Message is required")
        String message
) {}
