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
public class EodTask implements BlockerSubject {

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

    /**
     * Null while a draft's task row has no status chosen yet (V75) — Save Draft skips full
     * validation by design. {@link com.nforceone.sync.eod.EodService#validateLoggedDay} requires
     * a real value before the entry may leave DRAFT.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "task_status", length = 30)
    private TaskStatus taskStatus;

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

    // ── BlockerSubject ────────────────────────────────────────────────────────
    // The blocker tri-state label (getBlockerStatus) is the interface's one definition, shared with the Daily Log.

    @Override public Long getBlockerKey()              { return BlockerKey.ofTask(id); }
    @Override public EodEntry getBlockerEntry()        { return eodEntry; }
    @Override public Project getBlockerProject()       { return project; }
    @Override public String getBlockerDescription()    { return description; }
    @Override public BigDecimal getBlockerHours()      { return hours; }
    @Override public String getBlockerCategoryName()   { return taskCategory != null ? taskCategory.getName() : null; }
}
