package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodEntry;
import com.nforceone.sync.project.Project;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "eod_project_approval")
@Getter
@Setter
public class EodProjectApproval {

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
    @JoinColumn(name = "approver_id")
    private AppUser approver;

    @Enumerated(EnumType.STRING)
    @Column(name = "approver_type", nullable = false, length = 30)
    private ApproverType approverType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Status status;

    @Column(name = "frozen_at", nullable = false)
    private OffsetDateTime frozenAt;

    @Column(name = "acted_at")
    private OffsetDateTime actedAt;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    // Null = current-cycle piece. Non-null = superseded at this timestamp when the employee
    // resubmitted the entry. Matches the app_user.deleted_at soft-delete convention.
    @Column(name = "superseded_at")
    private OffsetDateTime supersededAt;

    // Escalation — set once when a stale LEAD piece is escalated to the project PM.
    // escalated_at is the timestamp of escalation; escalated_to is the PM who now also holds
    // authority to act. The piece stays in the lead's queue; first actor wins.
    @Column(name = "escalated_at")
    private OffsetDateTime escalatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "escalated_to_id")
    private AppUser escalatedTo;

    public enum ApproverType {
        LEAD, REPORTING_MANAGER, PM, ADMIN_GROUP, AUTO_APPROVED
    }

    public enum Status {
        PENDING, APPROVED, REJECTED
    }
}
