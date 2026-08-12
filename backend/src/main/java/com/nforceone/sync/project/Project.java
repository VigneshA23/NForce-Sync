package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.org.BillingModel;
import com.nforceone.sync.org.ProjectType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "project")
@Getter
@Setter
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 200)
    private String client;

    /** Admin-managed Organization Master (V51). Mandatory — the FK column is NOT NULL. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_type_id", nullable = false)
    private ProjectType projectType;

    /** Admin-managed Organization Master (V49). Mandatory since V53 — the FK column is NOT NULL. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "billing_model_id", nullable = false)
    private BillingModel billingModel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    /**
     * The project's Team Lead — an active MANAGER who approves EOD entries on it. The column keeps
     * its historical {@code pm_id} name; the role it holds is a Team Lead, not a PM.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pm_id")
    private AppUser pm;

    /**
     * The overseeing Project Manager (V55). Distinct from {@link #pm}: this scopes what a PM sees —
     * their Approvals queue, Project Dashboard, and the EOD-by-employee / Missing-EOD reports —
     * while the Team Lead is who actually decides entries.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_manager_id", nullable = false)
    private AppUser projectManager;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public enum Status {
        ACTIVE, INACTIVE, COMPLETED, ON_HOLD
    }
}
