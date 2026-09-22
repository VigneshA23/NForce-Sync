package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * One "round" of the EOD Clarification conversation — opened by a Team Lead against a SUBMITTED
 * EodEntry, resolved (terminally, for this round) by the same Team Lead. A DB partial unique
 * index (idx_eod_clarification_open_per_entry) guarantees at most one row per entry with
 * resolved_at IS NULL at a time; see EodClarificationService for the matching service-level check.
 */
@Entity
@Table(name = "eod_clarification")
@Getter
@Setter
public class EodClarification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "eod_entry_id", nullable = false)
    private EodEntry eodEntry;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "opened_by_id", nullable = false)
    private AppUser openedBy;

    @Column(name = "opened_at", nullable = false)
    private OffsetDateTime openedAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by_id")
    private AppUser resolvedBy;

    // TL-controlled, same 3 values and same dropdown-driven change model as Blockers' status —
    // unlike Blockers, this is a real column rather than derived from acknowledged_at/resolved_at.
    // resolved_at is set only when status transitions to RESOLVED (see EodClarificationService).
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.NEEDS_RESPONSE;

    public enum Status {
        NEEDS_RESPONSE, ACKNOWLEDGED, RESOLVED
    }

    public boolean isOpen() {
        return status != Status.RESOLVED;
    }
}
