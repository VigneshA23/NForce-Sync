package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

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

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Status status;

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
        DRAFT, SUBMITTED, APPROVED, REJECTED, CHANGES_REQUESTED, MISSED
    }

    public boolean isEditable() {
        return status == Status.DRAFT
            || status == Status.REJECTED
            || status == Status.CHANGES_REQUESTED;
    }
}
