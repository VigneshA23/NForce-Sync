package com.nforceone.sync.executive.dto;

public record ProjectAttentionDto(
        Long projectId,
        String projectName,
        String pmName,
        String status,
        String metric,
        String reason
) {}
