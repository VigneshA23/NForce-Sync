package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.TaskCategory;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "eod_task")
@Getter
@Setter
public class EodTask {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "eod_entry_id", nullable = false)
    private EodEntry eodEntry;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_category_id")
    private TaskCategory taskCategory;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(precision = 5, scale = 2)
    private BigDecimal hours;

    @Enumerated(EnumType.STRING)
    @Column(name = "task_status", nullable = false, length = 30)
    private TaskStatus taskStatus;

    @Column(name = "is_billable", nullable = false)
    private Boolean isBillable;

    // Set true once a Team Lead has explicitly toggled this task's billable status during
    // approval (see ApprovalService.setTaskBillable) — distinct from isBillable's default value,
    // which the approval gate must not silently accept as a decision.
    @Column(name = "billable_decided", nullable = false)
    private Boolean billableDecided = Boolean.FALSE;

    @Column(name = "blocker_reason", columnDefinition = "TEXT")
    private String blockerReason;

    @Column(name = "support_needed", columnDefinition = "TEXT")
    private String supportNeeded;

    // Lightweight Team Lead acknowledgement — distinct from ApprovalAction, doesn't resolve the blocker.
    @Column(name = "acknowledged_at")
    private OffsetDateTime acknowledgedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "acknowledged_by_id")
    private AppUser acknowledgedBy;

    // Manual "Resolved" marker set by the Team Lead from the Blockers page — layered on top of
    // acknowledgedAt (a resolved blocker is always also acknowledged), not a replacement for it.
    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by_id")
    private AppUser resolvedBy;

    public enum TaskStatus {
        COMPLETED, IN_PROGRESS, BLOCKED, NOT_STARTED
    }

    /** Single source of truth for the blocker tri-state label, shared by both the Team
     *  Lead's and the employee's DTOs so the two sides never derive it differently. */
    public String getBlockerStatus() {
        if (resolvedAt != null) return "RESOLVED";
        if (acknowledgedAt != null) return "ACKNOWLEDGED";
        return "NEEDS_RESPONSE";
    }
}
