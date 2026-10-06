package com.nforceone.sync.approval2;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "eod_project_approval_action")
@Getter
@Setter
public class EodProjectApprovalAction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "piece_id", nullable = false)
    private EodProjectApproval piece;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", nullable = false)
    private AppUser actor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Action action;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "acted_at", nullable = false)
    private OffsetDateTime actedAt;

    public enum Action {
        APPROVED, REJECTED
    }
}
