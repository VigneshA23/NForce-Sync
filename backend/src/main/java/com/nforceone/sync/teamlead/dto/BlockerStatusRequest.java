package com.nforceone.sync.teamlead.dto;

/** status: "NEEDS_RESPONSE" | "ACKNOWLEDGED" | "RESOLVED" — see TeamBlockerDto.deriveStatus. */
public record BlockerStatusRequest(String status) {}
