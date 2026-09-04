package com.nforceone.sync.utilization.dto;

import com.nforceone.sync.utilization.UtilSnapshot;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record UtilSnapshotDto(
        Long           id,
        Long           employeeId,
        LocalDate      snapshotDate,
        BigDecimal     availableHours,
        BigDecimal     approvedProductiveHours,
        BigDecimal     benchHours,
        BigDecimal     idleHours,
        BigDecimal     utilizationPct,
        OffsetDateTime computedAt
) {
    public static UtilSnapshotDto from(UtilSnapshot s) {
        return new UtilSnapshotDto(
                s.getId(),
                s.getEmployeeId(),
                s.getSnapshotDate(),
                s.getAvailableHours(),
                s.getApprovedProductiveHours(),
                s.getBenchHours(),
                s.getIdleHours(),
                s.getUtilizationPct(),
                s.getComputedAt()
        );
    }
}
