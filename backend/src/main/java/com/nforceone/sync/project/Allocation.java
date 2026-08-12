package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "allocation")
@Getter
@Setter
public class Allocation {

    /**
     * Stand-in end date for an open-ended allocation ({@code effective_to IS NULL}) when comparing
     * windows. A fixed maximum rather than a relative date, so an overlap check cannot depend on
     * when it runs, and bound as a plain non-null parameter — a nullable bind used as
     * {@code :param IS NULL} previously drew Postgres "could not determine data type of parameter".
     * Mirrored by the {@code DATE '9999-12-31'} literal in V54.
     */
    public static final LocalDate OPEN_ENDED = LocalDate.of(9999, 12, 31);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private AppUser employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "effective_to")
    private LocalDate effectiveTo;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
