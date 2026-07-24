package com.nforceone.sync.approval;

import com.nforceone.sync.auth.AppUser;
import com.nforceone.sync.eod.EodEntry;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

@Entity
@Table(name = "approval_action")
@Getter
@Setter
public class ApprovalAction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "eod_entry_id", nullable = false)
    private EodEntry eodEntry;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", nullable = false)
    private AppUser actor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Action action;

    @Column(columnDefinition = "TEXT")
    private String comment;

    @Column(name = "billable_override")
    private Boolean billableOverride;

    @Column(name = "acted_at", nullable = false)
    private OffsetDateTime actedAt;

    public enum Action {
        APPROVE, REJECT, REQUEST_CHANGES
    }
}
