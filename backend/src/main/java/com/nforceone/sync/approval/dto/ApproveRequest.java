package com.nforceone.sync.approval.dto;

public record ApproveRequest(
        Boolean billableOverride,
        String  comment
) {}
