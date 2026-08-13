package com.nforceone.sync.businessrules;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "shift_definition")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShiftDefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    /**
     * Hours after {@link #endTime} by which an EOD must be submitted, e.g. 3 on a 15:30-00:30
     * shift means 03:30. Expressed as an offset rather than a time-of-day so it stays unambiguous
     * for a shift that crosses midnight — see {@link ShiftSchedule#cutoffAt}.
     *
     * <p>Null means no cutoff is configured: no reminder is sent and no cutoff is shown.
     */
    @Column(name = "eod_cutoff_hours")
    private BigDecimal eodCutoffHours;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
