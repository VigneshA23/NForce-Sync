package com.nforceone.sync.project;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

// Global, application-wide master data — see V60. Never scoped to a Team Lead, team, project,
// or employee; uniqueness is enforced DB-side via task_category_normalized_name_uq
// (case-insensitive, whitespace-normalized on name).
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
}
