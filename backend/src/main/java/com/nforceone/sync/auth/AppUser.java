package com.nforceone.sync.auth;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "app_user")
@Getter
@Setter
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "full_name", nullable = false, length = 200)
    private String fullName;

    @Column(nullable = false, unique = true, length = 200)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    // HR employee ID in NF-##### format, assigned by the trg_employee_code trigger on
    // INSERT (see V22). Read-only to Hibernate: including it in INSERT/UPDATE would send
    // null and either suppress the trigger's generation or violate the NOT NULL on edit.
    @Column(name = "employee_code", nullable = false, unique = true,
            insertable = false, updatable = false)
    private String employeeCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private AppUser createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private AppUser manager;

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword = false;

    @Column(name = "department_id")
    private Long departmentId;

    @Column(name = "designation_id")
    private Long designationId;

    @Column(name = "location_id")
    private Long locationId;

    @Column(name = "employment_type", length = 50)
    private String employmentType;

    @Column(name = "work_mode", length = 50)
    private String workMode;

    @Column(name = "joining_date")
    private LocalDate joiningDate;

    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    public enum Role {
        EMPLOYEE, MANAGER, HR, SUPERADMIN, PM, DM, FINANCE, LEADERSHIP
    }

    public enum Status {
        ACTIVE, INACTIVE
    }
}
