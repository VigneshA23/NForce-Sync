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

    public enum ApproverType {
        LEAD, REPORTING_MANAGER, PM, ADMIN_GROUP, AUTO_APPROVED
    }

    public enum Status {
        PENDING, APPROVED, REJECTED
    }
}
