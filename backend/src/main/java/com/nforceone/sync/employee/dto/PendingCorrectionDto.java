package com.nforceone.sync.employee.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record PendingCorrectionDto(
        Long entryId,
        LocalDate entryDate,
        String status,
        String reviewerComment,
        OffsetDateTime updatedAt
) {}
