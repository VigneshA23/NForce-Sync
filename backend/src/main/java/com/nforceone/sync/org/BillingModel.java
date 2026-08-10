package com.nforceone.sync.org;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * An admin-managed commercial model a project is billed under (T & M, Fixed Bid, …).
 *
 * <p>Deliberately shaped like {@link Department}: same {@code is_active} flag and timestamp hooks, so
 * the Organization Masters service, DTO and UI patterns apply unchanged.
 */
@Entity
@Table(name = "billing_model")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BillingModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 200)
    private String name;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
