package com.nforceone.sync.auth;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
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

    // GENERATED ALWAYS AS IDENTITY — Hibernate must not include in INSERT/UPDATE
    @Column(name = "employee_code", nullable = false, unique = true,
            insertable = false, updatable = false)
    private Long employeeCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private AppUser createdBy;

    public enum Role {
        EMPLOYEE, MANAGER, HR, SUPERADMIN, PM, DM, FINANCE, LEADERSHIP
    }

    public enum Status {
        ACTIVE, INACTIVE
    }
}
