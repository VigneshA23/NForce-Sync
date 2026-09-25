package com.nforceone.sync.eod.dto;

import jakarta.validation.constraints.NotBlank;

/** Body for editing an existing Blocker/EOD Clarification reply's message text — same shape for
 *  both features (see BlockerConversationService.editReplyAsLead/AsEmployee and
 *  EodClarificationService.editReply). */
public record EditReplyRequest(
        @NotBlank(message = "Message is required")
        String message
) {}
