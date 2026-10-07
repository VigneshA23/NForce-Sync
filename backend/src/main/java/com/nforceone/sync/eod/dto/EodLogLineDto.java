package com.nforceone.sync.eod.dto;

import com.nforceone.sync.eod.EodLogLine;

import java.math.BigDecimal;

public record EodLogLineDto(
        Long id,
        Long categoryId,
        String categoryName,
        BigDecimal hours,
        String description,
        Integer sortOrder
) {
    public static EodLogLineDto from(EodLogLine line) {
        return new EodLogLineDto(
                line.getId(),
                line.getCategory().getId(),
                line.getCategory().getName(),
                line.getHours(),
                line.getDescription(),
                line.getSortOrder()
        );
    }
}
