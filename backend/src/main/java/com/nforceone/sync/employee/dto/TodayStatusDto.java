package com.nforceone.sync.employee.dto;

import java.time.OffsetDateTime;

public record TodayStatusDto(
        String status,
        OffsetDateTime submittedAt,
        String remarks
) {}
