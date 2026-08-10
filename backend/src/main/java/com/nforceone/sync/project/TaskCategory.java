package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "task_category")
@Getter
@Setter
public class TaskCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "is_productive", nullable = false)
    private Boolean isProductive;

    @Column(name = "is_billable_default", nullable = false)
    private Boolean isBillableDefault;

    @Column(nullable = false)
    private Boolean active;

    // Null = global category, visible to every employee (the original seeded list). Non-null =
    // owned by that Team Lead's team — mirrors a ProjectCategory the Team Lead created under
    // "My Projects" > Category Management; see TeamLeadProjectService.createCategory.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private AppUser manager;
}
