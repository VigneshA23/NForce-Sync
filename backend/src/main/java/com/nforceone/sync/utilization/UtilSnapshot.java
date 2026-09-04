package com.nforceone.sync.utilization;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "util_snapshot",
       uniqueConstraints = @UniqueConstraint(columnNames = {"employee_id", "snapshot_date"}))
@Getter
@Setter
public class UtilSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "snapshot_date", nullable = false)
    private LocalDate snapshotDate;

    @Column(name = "available_hours", nullable = false, precision = 5, scale = 2)
    private BigDecimal availableHours;

    @Column(name = "approved_productive_hours", nullable = false, precision = 5, scale = 2)
    private BigDecimal approvedProductiveHours;

    @Column(name = "bench_hours", nullable = false, precision = 5, scale = 2)
    private BigDecimal benchHours;

    @Column(name = "idle_hours", nullable = false, precision = 5, scale = 2)
    private BigDecimal idleHours;

    // NULL = N/A (available == 0, e.g. weekend). Not the same as 0.00.
    @Column(name = "utilization_pct", precision = 7, scale = 2)
    private BigDecimal utilizationPct;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt;
}
