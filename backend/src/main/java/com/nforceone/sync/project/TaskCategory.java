package com.nforceone.sync.project;

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

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(name = "is_productive", nullable = false)
    private Boolean isProductive;

    @Column(name = "is_billable_default", nullable = false)
    private Boolean isBillableDefault;

    @Column(nullable = false)
    private Boolean active;
}
