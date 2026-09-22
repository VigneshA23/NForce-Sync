package com.nforceone.sync.eod.dto;

/** status: "NEEDS_RESPONSE" | "ACKNOWLEDGED" | "RESOLVED" — see EodClarification.Status.
 *  Mirrors teamlead.dto.BlockerStatusRequest's shape for the same TL-only status dropdown. */
public record EodClarificationStatusRequest(String status) {}
