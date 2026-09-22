package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** Tracks, per (clarification round, viewing user), when that user last read the round's thread —
 *  the "unread/bold" indicator on the EOD Inbox row list is derived by comparing last_read_at
 *  against the round's latest message (see EodClarificationService). One row per user per round,
 *  enforced by a unique(clarification_id, user_id) index — upserted on mark-read, not re-created. */
@Entity
@Table(name = "eod_clarification_read_state")
@Getter
@Setter
public class EodClarificationReadState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "clarification_id", nullable = false)
    private EodClarification clarification;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(name = "last_read_at", nullable = false)
    private OffsetDateTime lastReadAt;
}
