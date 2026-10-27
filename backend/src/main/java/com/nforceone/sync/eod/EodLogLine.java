package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.project.Project;
import com.nforceone.sync.project.TaskCategory;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One category line inside a PLAIN_LOG EOD entry — V110.
// Legacy PLAIN_LOG entries (before V110) have no rows here.
//
// V118: a line carries its own Status (the same four values as a Submit EOD task) and, when Blocked, a blocker
// reason plus the Acknowledge / Resolve markers an eod_task has — so a Daily Log blocker is a real, first-class
// blocker (see BlockerSubject) with no hidden eod_task row behind it. All NULL on rows from before V118.
@Entity
@Table(name = "eod_log_line")
@Getter
@Setter
public class EodLogLine implements BlockerSubject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id", nullable = false)
    private EodEntry entry;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id", nullable = false)
    private TaskCategory category;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal hours;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    /** Null on a draft row that has no status chosen yet, and on every row from before V118. Required on submit. */
    @Enumerated(EnumType.STRING)
    @Column(name = "task_status", length = 30)
    private EodTask.TaskStatus taskStatus;

    @Column(name = "blocker_reason", columnDefinition = "TEXT")
    private String blockerReason;

    @Column(name = "acknowledged_at")
    private OffsetDateTime acknowledgedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "acknowledged_by_id")
    private AppUser acknowledgedBy;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by_id")
    private AppUser resolvedBy;

    // ── BlockerSubject ────────────────────────────────────────────────────────

    @Override public Long getBlockerKey()              { return BlockerKey.ofLine(id); }
    @Override public EodEntry getBlockerEntry()        { return entry; }
    @Override public Project getBlockerProject()       { return null; }
    @Override public String getBlockerDescription()    { return description; }
    @Override public BigDecimal getBlockerHours()      { return hours; }
    @Override public String getBlockerCategoryName()   { return category != null ? category.getName() : null; }
    @Override public String getSupportNeeded()         { return null; }
}
