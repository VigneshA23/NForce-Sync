package com.nforceone.sync.project;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "project_category")
@Getter
@Setter
public class ProjectCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Optional: a category is generic master data owned by the Team Lead who created it, not
    // a sub-resource of one project — see TeamLeadProjectService. It may still be tagged to a
    // project the creator is assigned to when that's useful, but does not require one.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(length = 50)
    private String code;

    @Column(length = 500)
    private String description;

    @Column(length = 20)
    private String color;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    // Links to the TaskCategory row mirroring this one — set on create so the Team Lead's
    // category is selectable in the Employee EOD dropdown, scoped to their team; see
    // TeamLeadProjectService.createCategory and TaskCategoryController.
    @Column(name = "task_category_id")
    private Long taskCategoryId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private AppUser createdBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public enum Status {
        ACTIVE, INACTIVE
    }
}
