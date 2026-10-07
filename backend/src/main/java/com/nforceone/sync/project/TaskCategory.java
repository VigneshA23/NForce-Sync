package com.nforceone.sync.project;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

// Global master data — see V60, V110.
// Scoped by `scope`: EMPLOYEE categories appear in the employee Submit EOD dropdown;
// MANAGEMENT categories appear in the Daily Log (PLAIN_LOG) form.
// Uniqueness is per-scope: (scope, lower(btrim(name))) — see task_category_scope_name_uq.
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

    @Column(nullable = false)
    private Boolean active;

    // EMPLOYEE: shown in the project-task category dropdown on Submit EOD.
    // MANAGEMENT: shown in the Daily Log line-item category dropdown.
    @Column(nullable = false, length = 20)
    private String scope = "EMPLOYEE";
}
