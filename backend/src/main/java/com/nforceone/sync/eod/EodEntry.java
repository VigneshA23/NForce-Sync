package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "eod_entry",
       uniqueConstraints = @UniqueConstraint(columnNames = {"employee_id", "entry_date"}))
@Getter
@Setter
public class EodEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private AppUser employee;

    // Point-in-time snapshot of employee.getManager().getId() taken at submission — distinct
    // from the employee's live app_user.manager_id, which keeps changing on reassignment. Every
    // manager-scoped EOD query (Approvals, Team Lead dashboard/blockers) filters on THIS field so
    // an entry stays with whoever was managing the employee when they submitted it.
    @Column(name = "manager_id")
    private Long managerId;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_type", nullable = false, length = 20)
    private DayType dayType = DayType.WORKING_DAY;

    /** Null when no time adjustment was requested. Only ever set on a WORKING_DAY. */
    @Enumerated(EnumType.STRING)
    @Column(name = "time_adjustment_type", length = 20)
    private TimeAdjustmentType timeAdjustmentType;

    @Column(name = "time_adjustment_minutes")
    private Integer timeAdjustmentMinutes;

    /** Hours logged beyond the day's reference. Flagged for the manager, never a rejection. */
    @Column(name = "is_overtime", nullable = false)
    private Boolean isOvertime = Boolean.FALSE;

    @Column(name = "overtime_hours", precision = 5, scale = 2)
    private BigDecimal overtimeHours;

    @Column(name = "work_location", length = 100)
    private String workLocation;

    @Column(name = "next_day_plan", columnDefinition = "TEXT")
    private String nextDayPlan;

    @Column(columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "submitted_at")
    private OffsetDateTime submittedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @OneToMany(mappedBy = "eodEntry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<EodTask> tasks = new ArrayList<>();

    public enum Status {
        // CHANGES_REQUESTED removed in V44 — REJECTED already returns the entry to the employee
        // for edit and resubmit, so the two were functionally identical. Existing rows were
        // migrated to REJECTED.
        DRAFT, SUBMITTED, APPROVED, REJECTED, MISSED
    }

    /** Day-level classification. HOLIDAY carries no task rows at all. */
    public enum DayType {
        WORKING_DAY, LEAVE, HOLIDAY
    }

    /** Partial-day schedule shift on a working day. Not an absence — that is DayType.LEAVE. */
    public enum TimeAdjustmentType {
        LATE_ARRIVAL, INTERVENING, EARLY_LEAVE
    }

    public boolean isEditable() {
        return status == Status.DRAFT
            || status == Status.REJECTED;
    }
}
