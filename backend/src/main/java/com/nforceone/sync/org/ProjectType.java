package com.nforceone.sync.org;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * An admin-managed project type (Client, Internal, …).
 *
 * <p>Carries a behaviour flag because project type used to gate a real rule through the literal
 * string {@code "CLIENT"}: whether a client name is required. Keying the rule off the flag instead
 * means a Super Admin can rename or add a type without silently changing that requirement.
 */
@Entity
@Table(name = "project_type")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 200)
    private String name;

    /** When true, a project of this type must name its client; otherwise the client is cleared. */
    @Column(name = "requires_client", nullable = false)
    @Builder.Default
    private boolean requiresClient = false;

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
