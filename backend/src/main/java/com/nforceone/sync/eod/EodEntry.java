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
        // PARTIALLY_APPROVED added back to match V98 (applied to the shared DB out-of-band by
        // the unmerged per-project-approval work on vigneshdev) — this checkout has no
        // per-project approval feature, so it is treated as "still needs approval action",
        // same as SUBMITTED, everywhere it's read.
        DRAFT, SUBMITTED, APPROVED, PARTIALLY_APPROVED, REJECTED, MISSED
    }

    /**
     * Day-level classification. HOLIDAY carries no task rows at all. FIRST_HALF_LEAVE and
     * SECOND_HALF_LEAVE are half-day absences: the other half is still worked, so — unlike
     * LEAVE — they carry task rows, a work location, and a (reduced) minimum-hours requirement.
     * WEEKEND is a non-working day like HOLIDAY/LEAVE (no work location, no minimum-hours floor),
     * but — unlike them — it still accepts optional task rows: any hours logged there are entirely
     * overtime (see EodService.applyOvertime), never counted toward a regular-hours baseline.
     */
    public enum DayType {
        WORKING_DAY, FIRST_HALF_LEAVE, SECOND_HALF_LEAVE, LEAVE, HOLIDAY, WEEKEND
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
