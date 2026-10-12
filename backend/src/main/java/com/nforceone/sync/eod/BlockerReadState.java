package com.nforceone.sync.eod;

import com.nforceone.sync.auth.AppUser;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** Per (blocker task, viewing user): when the user last opened the blocker's reply thread. The employee-side
 *  unread badge counts blockers with a reviewer reply newer than this. One row per user per blocker
 *  (unique index), upserted on open — see BlockerConversationService#markReadAsEmployee. */
@Entity
@Table(name = "blocker_read_state")
@Getter
@Setter
public class BlockerReadState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private EodTask task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(name = "last_read_at", nullable = false)
    private OffsetDateTime lastReadAt;
}
